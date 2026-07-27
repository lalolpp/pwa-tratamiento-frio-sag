export const VALIDATION_IDS = {
  TEMPERATURE_AVG: 'temperature_avg',
  TEMPERATURE_MAX_DEVIATION: 'temperature_max_deviation',
  CONTINUOUS_RECORDING: 'continuous_recording',
  SENSOR_COVERAGE: 'sensor_coverage',
  TREATMENT_DURATION: 'treatment_duration',
  RECORDING_FREQUENCY: 'recording_frequency',
  SENSOR_COUNT: 'sensor_count',
  AMBIENT_TEMP: 'ambient_temp',
};

function getProtocolTargets(protocol, metadata) {
  const temperatureMax = metadata?.temperatureMax ?? protocol.temperatureMax ?? 0.5;
  const temperatureTarget = metadata?.temperatureTarget ?? protocol.temperatureTarget ?? -0.5;
  const startThreshold = metadata?.startThreshold ?? protocol.startThreshold ?? 0;
  const durationDays = metadata?.durationDays ?? protocol.durationDays ?? 42;
  const maxGapHours = protocol.maxGapHours ?? 2;
  const recordingIntervalHours = protocol.recordingIntervalHours ?? 1;
  const minSensorsPulpa = protocol.minSensorsPulpa ?? 2;
  return { temperatureMax, temperatureTarget, startThreshold, durationDays, maxGapHours, recordingIntervalHours, minSensorsPulpa };
}

function allPulpaSensorsBelowThreshold(record, pulpaSensors, threshold) {
  if (pulpaSensors.length === 0) return false;
  return pulpaSensors.every(sensorName => {
    const sensor = record.sensors[sensorName];
    return sensor && sensor.isValid && sensor.value <= threshold;
  });
}

function findTreatmentStart(records, pulpaSensors, threshold) {
  for (let i = 0; i < records.length; i++) {
    if (allPulpaSensorsBelowThreshold(records[i], pulpaSensors, threshold)) {
      return i;
    }
  }
  return -1;
}

function getActivePulpaSensors(parsedData, metadata) {
  const sensorConfig = metadata?.sensorConfig;
  if (sensorConfig && sensorConfig.length > 0) {
    return sensorConfig
      .filter(s => s.role === 'pulpa')
      .map(s => s.originalName)
      .filter(name => parsedData.sensorNames.includes(name));
  }
  return parsedData.sensorNames.filter(s =>
    /pulpa|p\d|s\d|sensor\s*\d/i.test(s)
  );
}

function getActiveAmbienteSensors(parsedData, metadata) {
  const sensorConfig = metadata?.sensorConfig;
  if (sensorConfig && sensorConfig.length > 0) {
    return sensorConfig
      .filter(s => s.role === 'ambiente')
      .map(s => s.originalName)
      .filter(name => parsedData.sensorNames.includes(name));
  }
  return parsedData.sensorNames.filter(s => /hr|rh|hum|humedad/i.test(s));
}

function getActiveSensorNames(parsedData, metadata) {
  const sensorConfig = metadata?.sensorConfig;
  if (sensorConfig && sensorConfig.length > 0) {
    return sensorConfig
      .filter(s => s.role !== 'excluido')
      .map(s => s.originalName)
      .filter(name => parsedData.sensorNames.includes(name));
  }
  return parsedData.sensorNames;
}

const validations = [
  {
    id: VALIDATION_IDS.TEMPERATURE_AVG,
    name: 'Temperatura promedio',
    evaluate(parsedData, protocol, metadata) {
      const { temperatureMax } = getProtocolTargets(protocol, metadata);
      const pulpaSensors = getActivePulpaSensors(parsedData, metadata);

      if (pulpaSensors.length === 0) {
        return { status: 'no_cumple', detail: 'No se detectaron sensores de pulpa' };
      }

      const treatmentStartIdx = findTreatmentStart(parsedData.records, pulpaSensors, 0);
      if (treatmentStartIdx === -1) {
        return { status: 'no_cumple', detail: 'Nunca se alcanzó 0°C con todos los sensores de pulpa' };
      }

      const treatmentRecords = parsedData.records.slice(treatmentStartIdx);

      let sum = 0;
      let count = 0;
      let maxTemp = -Infinity;

      treatmentRecords.forEach(record => {
        pulpaSensors.forEach(sensorName => {
          const sensor = record.sensors[sensorName];
          if (sensor && sensor.isValid) {
            sum += sensor.value;
            count++;
            if (sensor.value > maxTemp) maxTemp = sensor.value;
          }
        });
      });

      if (count === 0) {
        return { status: 'no_cumple', detail: 'Sin datos válidos durante el tratamiento' };
      }

      const avg = Math.round((sum / count) * 10) / 10;

      if (avg <= temperatureMax) {
        return {
          status: 'cumple',
          detail: `Promedio: ${avg}°C (máx permitido: ${temperatureMax}°C, sin límite inferior) — desde tratamiento activo`,
          value: avg,
        };
      }

      return {
        status: 'no_cumple',
        detail: `Promedio: ${avg}°C excede el máximo permitido (${temperatureMax}°C) — durante tratamiento activo`,
        value: avg,
      };
    },
  },

  {
    id: VALIDATION_IDS.TEMPERATURE_MAX_DEVIATION,
    name: 'Desviación máxima por sensor',
    evaluate(parsedData, protocol, metadata) {
      const { temperatureMax } = getProtocolTargets(protocol, metadata);
      const pulpaSensors = getActivePulpaSensors(parsedData, metadata);

      const treatmentStartIdx = findTreatmentStart(parsedData.records, pulpaSensors, 0);
      if (treatmentStartIdx === -1) {
        return { status: 'no_cumple', detail: 'Nunca se alcanzó 0°C con todos los sensores de pulpa' };
      }

      const treatmentRecords = parsedData.records.slice(treatmentStartIdx);
      const deviations = [];

      treatmentRecords.forEach(record => {
        pulpaSensors.forEach(sensorName => {
          const sensor = record.sensors[sensorName];
          if (sensor && sensor.isValid && sensor.value > temperatureMax) {
            deviations.push({
              sensor: sensorName,
              timestamp: record.timestamp,
              value: sensor.value,
              maxAllowed: temperatureMax,
            });
          }
        });
      });

      if (deviations.length === 0) {
        return { status: 'cumple', detail: 'Ningún sensor excedió el máximo permitido durante el tratamiento' };
      }

      const groupBySensor = deviations.reduce((acc, d) => {
        if (!acc[d.sensor]) acc[d.sensor] = [];
        acc[d.sensor].push(d);
        return acc;
      }, {});

      const details = Object.entries(groupBySensor).map(([sensor, devs]) => {
        const first = devs[0].timestamp.toLocaleString('es-CL');
        const maxTemp = Math.max(...devs.map(d => d.value));
        return `${sensor}: ${devs.length} registros > ${temperatureMax}°C (máx: ${maxTemp}°C, desde: ${first})`;
      });

      return {
        status: 'no_cumple',
        detail: details.join(' | '),
        deviations,
      };
    },
  },

  {
    id: VALIDATION_IDS.CONTINUOUS_RECORDING,
    name: 'Continuidad del registro',
    evaluate(parsedData, protocol, metadata) {
      const { maxGapHours } = getProtocolTargets(protocol, metadata);
      const gaps = parsedData.stats.gaps;
      const significantGaps = gaps.filter(g => g.hours > maxGapHours);

      if (significantGaps.length === 0) {
        return { status: 'cumple', detail: 'Registro continuo sin interrupciones significativas' };
      }

      const details = significantGaps.map(g =>
        `Desde ${g.start.toLocaleString('es-CL')} hasta ${g.end.toLocaleString('es-CL')} (${g.hours} horas)`
      );

      return {
        status: 'no_cumple',
        detail: `${significantGaps.length} interrupción(es) detectada(s): ${details.join('; ')}`,
      };
    },
  },

  {
    id: VALIDATION_IDS.SENSOR_COVERAGE,
    name: 'Cobertura de sensores',
    evaluate(parsedData, protocol, metadata) {
      const pulpaSensors = getActivePulpaSensors(parsedData, metadata);

      const deadSensors = pulpaSensors.filter(name => {
        const stats = parsedData.stats.sensorStats[name];
        return stats && (stats.null === stats.total || stats.valid / stats.total < 0.1);
      });

      if (deadSensors.length === 0) {
        return { status: 'cumple', detail: 'Todos los sensores reportaron datos durante el tratamiento' };
      }

      return {
        status: 'no_cumple',
        detail: `Sensores sin datos suficientes: ${deadSensors.join(', ')}`,
      };
    },
  },

  {
    id: VALIDATION_IDS.TREATMENT_DURATION,
    name: 'Tiempo efectivo de tratamiento',
    evaluate(parsedData, protocol, metadata) {
      const { durationDays } = getProtocolTargets(protocol, metadata);
      const pulpaSensors = getActivePulpaSensors(parsedData, metadata);

      if (pulpaSensors.length === 0) {
        return { status: 'no_cumple', detail: 'No se detectaron sensores de pulpa' };
      }

      const treatmentStartIdx = findTreatmentStart(parsedData.records, pulpaSensors, 0);
      if (treatmentStartIdx === -1) {
        return { status: 'no_cumple', detail: 'Nunca se alcanzó 0°C con todos los sensores de pulpa — tratamiento no iniciado' };
      }

      const treatmentStartMs = parsedData.records[treatmentStartIdx].timestamp.getTime();
      const endMs = parsedData.stats.dateRange.end.getTime();
      let effectiveMs = 0;
      let lastValidTimestamp = null;

      for (let i = treatmentStartIdx; i < parsedData.records.length; i++) {
        const record = parsedData.records[i];
        if (allPulpaSensorsBelowThreshold(record, pulpaSensors, 0)) {
          if (lastValidTimestamp !== null) {
            const diffMs = record.timestamp.getTime() - lastValidTimestamp;
            if (diffMs > 0 && diffMs < 6 * 60 * 60 * 1000) {
              effectiveMs += diffMs;
            }
          }
          lastValidTimestamp = record.timestamp.getTime();
        } else {
          lastValidTimestamp = null;
        }
      }

      const effectiveHours = effectiveMs / (1000 * 60 * 60);
      const effectiveDays = effectiveHours / 24;
      const treatmentStart = parsedData.records[treatmentStartIdx].timestamp.toLocaleString('es-CL');

      if (effectiveDays >= durationDays) {
        return {
          status: 'cumple',
          detail: `${effectiveDays.toFixed(1)} días efectivos (requerido: ${durationDays} días) — tratamiento desde ${treatmentStart}`,
        };
      }

      return {
        status: 'no_cumple',
        detail: `${effectiveDays.toFixed(1)} días efectivos vs ${durationDays} días requeridos. Faltan ${(durationDays - effectiveDays).toFixed(1)} días — tratamiento desde ${treatmentStart}`,
      };
    },
  },

  {
    id: VALIDATION_IDS.RECORDING_FREQUENCY,
    name: 'Frecuencia de registro',
    evaluate(parsedData, protocol, metadata) {
      const { recordingIntervalHours } = getProtocolTargets(protocol, metadata);
      const maxIntervalMs = recordingIntervalHours * 60 * 60 * 1000 * 1.5;
      let violations = 0;

      for (let i = 1; i < parsedData.records.length; i++) {
        const diff = parsedData.records[i].timestamp.getTime() - parsedData.records[i - 1].timestamp.getTime();
        if (diff > maxIntervalMs) {
          violations++;
        }
      }

      const violationRate = violations / parsedData.records.length;

      if (violationRate < 0.05) {
        return {
          status: 'cumple',
          detail: `Frecuencia de registro adecuada (${parsedData.stats.totalRecords} registros en el período)`,
        };
      }

      return {
        status: 'no_cumple',
        detail: `${violations} intervalos exceden la frecuencia máxima de ${recordingIntervalHours} hora(s)`,
      };
    },
  },

  {
    id: VALIDATION_IDS.SENSOR_COUNT,
    name: 'Cantidad de sensores',
    evaluate(parsedData, protocol, metadata) {
      const { minSensorsPulpa } = getProtocolTargets(protocol, metadata);
      const pulpaSensors = getActivePulpaSensors(parsedData, metadata);

      if (pulpaSensors.length >= minSensorsPulpa) {
        return {
          status: 'cumple',
          detail: `${pulpaSensors.length} sensores de pulpa detectados (requerido: ${minSensorsPulpa})`,
        };
      }

      return {
        status: 'no_cumple',
        detail: `${pulpaSensors.length} sensores de pulpa detectados (requerido: ${minSensorsPulpa})`,
      };
    },
  },

  {
    id: VALIDATION_IDS.AMBIENT_TEMP,
    name: 'Temperatura ambiente (informativo)',
    evaluate(parsedData, protocol, metadata) {
      const ambienteSensors = getActiveAmbienteSensors(parsedData, metadata);

      if (ambienteSensors.length === 0) {
        return { status: 'info', detail: 'Sin sensores de ambiente configurados' };
      }

      let sum = 0;
      let count = 0;
      let min = Infinity;
      let max = -Infinity;

      parsedData.records.forEach(record => {
        ambienteSensors.forEach(sensorName => {
          const sensor = record.sensors[sensorName];
          if (sensor && sensor.isValid) {
            sum += sensor.value;
            count++;
            if (sensor.value < min) min = sensor.value;
            if (sensor.value > max) max = sensor.value;
          }
        });
      });

      if (count === 0) {
        return { status: 'info', detail: 'Sin datos válidos de ambiente' };
      }

      const avg = Math.round((sum / count) * 10) / 10;
      const range = Math.round((max - min) * 10) / 10;

      return {
        status: 'info',
        detail: `Ambiente: promedio ${avg}°C (mín ${min}°C / máx ${max}°C, fluctuación ${range}°C) — ${ambienteSensors.length} sensor(es)`,
      };
    },
  },
];

export function evaluate(parsedData, protocol, metadata) {
  const results = validations.map(v => {
    try {
      const result = v.evaluate(parsedData, protocol, metadata);
      return {
        id: v.id,
        name: v.name,
        status: result.status,
        detail: result.detail,
        deviations: result.deviations || null,
        value: result.value || null,
      };
    } catch (error) {
      return {
        id: v.id,
        name: v.name,
        status: 'error',
        detail: `Error al evaluar: ${error.message}`,
        deviations: null,
        value: null,
      };
    }
  });

  const evaluableResults = results.filter(r => r.status !== 'info');
  const allPassed = evaluableResults.every(r => r.status === 'cumple');
  const passedCount = evaluableResults.filter(r => r.status === 'cumple').length;
  const totalDeviations = results
    .filter(r => r.deviations)
    .flatMap(r => r.deviations);

  return {
    status: allPassed ? 'aprobado' : 'no_aprobado',
    validations: results,
    summary: `${passedCount}/${evaluableResults.length} validaciones aprobadas`,
    deviations: totalDeviations,
  };
}
