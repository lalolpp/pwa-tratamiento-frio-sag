export const VALIDATION_IDS = {
  TEMPERATURE_AVG: 'temperature_avg',
  TEMPERATURE_MAX_DEVIATION: 'temperature_max_deviation',
  CONTINUOUS_RECORDING: 'continuous_recording',
  SENSOR_COVERAGE: 'sensor_coverage',
  TREATMENT_DURATION: 'treatment_duration',
  RECORDING_FREQUENCY: 'recording_frequency',
  SENSOR_COUNT: 'sensor_count',
  AMBIENT_TEMP: 'ambient_temp',
  DEFROST_CYCLES: 'defrost_cycles',
};

function detectDefrostCycles(records, pulpaSensors, treatmentStartIdx, temperatureMax) {
  const cycles = [];
  let inDefrost = false;
  let cycleStart = null;
  let cycleMaxTemp = -Infinity;
  let cycleSensorMax = {};
  const defrostThreshold = Math.max(temperatureMax + 1.5, 2);

  for (let i = treatmentStartIdx; i < records.length; i++) {
    const record = records[i];
    const anyAboveMax = pulpaSensors.some(name => {
      const s = record.sensors[name];
      return s && s.isValid && s.value > defrostThreshold;
    });

    if (anyAboveMax) {
      if (!inDefrost) {
        inDefrost = true;
        cycleStart = record.timestamp;
        cycleMaxTemp = -Infinity;
        cycleSensorMax = {};
      }
      pulpaSensors.forEach(name => {
        const s = record.sensors[name];
        if (s && s.isValid && s.value > cycleMaxTemp) cycleMaxTemp = s.value;
        if (s && s.isValid && (!cycleSensorMax[name] || s.value > cycleSensorMax[name])) {
          cycleSensorMax[name] = s.value;
        }
      });
    } else if (inDefrost) {
      const cycleEnd = record.timestamp;
      const durationMs = cycleEnd.getTime() - cycleStart.getTime();
      const durationMin = Math.round(durationMs / 60000);
      if (durationMin >= 30) {
        cycles.push({
          start: cycleStart,
          end: cycleEnd,
          durationMin,
          maxTemp: Math.round(cycleMaxTemp * 10) / 10,
          sensorMax: cycleSensorMax,
        });
      }
      inDefrost = false;
    }
  }

  if (inDefrost) {
    const lastRecord = records[records.length - 1];
    const durationMs = lastRecord.timestamp.getTime() - cycleStart.getTime();
    const durationMin = Math.round(durationMs / 60000);
    if (durationMin >= 30) {
      cycles.push({
        start: cycleStart,
        end: lastRecord.timestamp,
        durationMin,
        maxTemp: Math.round(cycleMaxTemp * 10) / 10,
        sensorMax: cycleSensorMax,
        ongoing: true,
      });
    }
  }

  return cycles;
}

function getDefrostSet(records, pulpaSensors, treatmentStartIdx, temperatureMax) {
  const defrostSet = new Set();
  const cycles = detectDefrostCycles(records, pulpaSensors, treatmentStartIdx, temperatureMax);
  cycles.forEach(cycle => {
    for (let i = 0; i < records.length; i++) {
      if (records[i].timestamp >= cycle.start && records[i].timestamp <= cycle.end) {
        defrostSet.add(i);
      }
    }
  });
  return { defrostSet, cycles };
}

function findSaturationIndex(records, pulpaSensors, treatmentStartIdx, defrostSet, requiredHours, temperatureMax) {
  let effectiveMs = 0;
  let lastValidTimestamp = null;
  for (let i = treatmentStartIdx; i < records.length; i++) {
    const record = records[i];
    if (defrostSet.has(i)) {
      lastValidTimestamp = null;
      continue;
    }
    const allBelowMax = pulpaSensors.every(name => {
      const s = record.sensors[name];
      return s && s.isValid && s.value <= temperatureMax;
    });
    if (allBelowMax) {
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
    if (effectiveMs >= requiredHours * 3600000) {
      return i;
    }
  }
  return records.length - 1;
}

function getProtocolTargets(protocol, metadata) {
  const temperatureMin = metadata?.temperatureMin ?? protocol.temperatureMin ?? -1.5;
  const temperatureTarget = metadata?.temperatureTarget ?? protocol.temperatureTarget ?? -0.5;
  const temperatureMax = metadata?.temperatureMax ?? protocol.temperatureMax ?? 0.5;
  const startThreshold = metadata?.startThreshold ?? protocol.startThreshold ?? 0;
  const durationDays = metadata?.durationDays ?? protocol.durationDays ?? 42;
  const maxGapHours = metadata?.maxGapHours ?? protocol.maxGapHours ?? 2;
  const recordingIntervalHours = metadata?.recordingIntervalHours ?? protocol.recordingIntervalHours ?? 1;
  const minSensorsPulpa = metadata?.minSensorsPulpa ?? protocol.minSensorsPulpa ?? 2;
  return { temperatureMin, temperatureTarget, temperatureMax, startThreshold, durationDays, maxGapHours, recordingIntervalHours, minSensorsPulpa };
}

function allPulpaSensorsBelowThreshold(record, pulpaSensors, threshold) {
  if (pulpaSensors.length === 0) return false;
  return pulpaSensors.every(sensorName => {
    const sensor = record.sensors[sensorName];
    return sensor && sensor.isValid && sensor.value <= threshold;
  });
}

function allPulpaSensorsInRange(record, pulpaSensors, min, max) {
  if (pulpaSensors.length === 0) return false;
  return pulpaSensors.every(sensorName => {
    const sensor = record.sensors[sensorName];
    return sensor && sensor.isValid && sensor.value >= min && sensor.value <= max;
  });
}

function anyPulpaSensorOutOfRange(record, pulpaSensors, min, max) {
  if (pulpaSensors.length === 0) return false;
  return pulpaSensors.some(sensorName => {
    const sensor = record.sensors[sensorName];
    return sensor && sensor.isValid && (sensor.value < min || sensor.value > max);
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

function isDuringRestriction(timestamp, metadata) {
  if (!metadata?.energyRestriction) return false;
  const [startH, startM] = (metadata.restrictionStart || '17:45').split(':').map(Number);
  const [endH, endM] = (metadata.restrictionEnd || '23:30').split(':').map(Number);
  const minutes = timestamp.getHours() * 60 + timestamp.getMinutes();
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  if (startMin <= endMin) {
    return minutes >= startMin && minutes <= endMin;
  }
  return minutes >= startMin || minutes <= endMin;
}

function isGapDuringRestriction(gap, metadata) {
  if (!metadata?.energyRestriction) return false;
  return isDuringRestriction(gap.start, metadata) || isDuringRestriction(gap.end, metadata);
}

function countRestrictionHours(metadata) {
  if (!metadata?.energyRestriction) return 0;
  const [startH, startM] = (metadata.restrictionStart || '17:45').split(':').map(Number);
  const [endH, endM] = (metadata.restrictionEnd || '23:30').split(':').map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  const diff = endMin > startMin ? endMin - startMin : (1440 - startMin) + endMin;
  return diff / 60;
}

const validations = [
  {
    id: VALIDATION_IDS.TEMPERATURE_AVG,
    name: 'Temperatura promedio',
    evaluate(parsedData, protocol, metadata) {
      const { temperatureMin, temperatureTarget, temperatureMax } = getProtocolTargets(protocol, metadata);
      const pulpaSensors = getActivePulpaSensors(parsedData, metadata);

      if (pulpaSensors.length === 0) {
        return { status: 'no_cumple', detail: 'No se detectaron sensores de pulpa' };
      }

      const treatmentStartIdx = findTreatmentStart(parsedData.records, pulpaSensors, 0);
      if (treatmentStartIdx === -1) {
        return { status: 'no_cumple', detail: 'Nunca se alcanzó 0°C con todos los sensores de pulpa' };
      }

      const { defrostSet, cycles } = getDefrostSet(parsedData.records, pulpaSensors, treatmentStartIdx, temperatureMax);
      const { durationDays } = getProtocolTargets(protocol, metadata);
      const requiredHours = durationDays * 24;
      const saturationIdx = findSaturationIndex(parsedData.records, pulpaSensors, treatmentStartIdx, defrostSet, requiredHours, temperatureMax);

      let sum = 0;
      let count = 0;

      for (let i = treatmentStartIdx; i <= saturationIdx; i++) {
        const record = parsedData.records[i];
        if (defrostSet.has(i)) continue;
        pulpaSensors.forEach(sensorName => {
          const sensor = record.sensors[sensorName];
          if (sensor && sensor.isValid) {
            sum += sensor.value;
            count++;
          }
        });
      }

      if (count === 0) {
        return { status: 'no_cumple', detail: 'Sin datos válidos durante el tratamiento (excluyendo deshielos)' };
      }

      const avg = Math.round((sum / count) * 10) / 10;
      const extraInfo = cycles.length > 0 ? ` — ${cycles.length} ciclo(s) de deshielo excluido(s)` : '';

      if (avg <= temperatureMax) {
        return {
          status: 'cumple',
          detail: `Promedio: ${avg}°C (no debe exceder: ${temperatureMax}°C)${extraInfo}`,
          value: avg,
          defrostCycles: cycles.length,
        };
      }

      return {
        status: 'no_cumple',
        detail: `Promedio: ${avg}°C excede el máximo permitido (${temperatureMax}°C)${extraInfo}`,
        value: avg,
        defrostCycles: cycles.length,
      };
    },
  },

  {
    id: VALIDATION_IDS.TEMPERATURE_MAX_DEVIATION,
    name: 'Desviación máxima por sensor',
    evaluate(parsedData, protocol, metadata) {
      const { temperatureMin, temperatureMax } = getProtocolTargets(protocol, metadata);
      const pulpaSensors = getActivePulpaSensors(parsedData, metadata);

      const treatmentStartIdx = findTreatmentStart(parsedData.records, pulpaSensors, 0);
      if (treatmentStartIdx === -1) {
        return { status: 'no_cumple', detail: 'Nunca se alcanzó 0°C con todos los sensores de pulpa' };
      }

      const { defrostSet, cycles } = getDefrostSet(parsedData.records, pulpaSensors, treatmentStartIdx, temperatureMax);
      const { durationDays } = getProtocolTargets(protocol, metadata);
      const requiredHours = durationDays * 24;
      const saturationIdx = findSaturationIndex(parsedData.records, pulpaSensors, treatmentStartIdx, defrostSet, requiredHours, temperatureMax);
      const deviations = [];

      for (let i = treatmentStartIdx; i <= saturationIdx; i++) {
        const record = parsedData.records[i];
        if (defrostSet.has(i)) continue;
        pulpaSensors.forEach(sensorName => {
          const sensor = record.sensors[sensorName];
          if (!sensor || !sensor.isValid) return;
          if (sensor.value > temperatureMax) {
            deviations.push({
              sensor: sensorName,
              timestamp: record.timestamp,
              value: sensor.value,
              maxAllowed: temperatureMax,
            });
          }
        });
      }

      const excludedInfo = cycles.length > 0 ? ` (${cycles.length} ciclo(s) de deshielo excluido(s))` : '';

      if (deviations.length === 0) {
        return { status: 'cumple', detail: `Ningún sensor superó ${temperatureMax}°C durante el tratamiento (máx estricto)${excludedInfo}` };
      }

      const groupBySensor = deviations.reduce((acc, d) => {
        if (!acc[d.sensor]) acc[d.sensor] = [];
        acc[d.sensor].push(d);
        return acc;
      }, {});

      const details = Object.entries(groupBySensor).map(([sensor, devs]) => {
        const first = devs[0].timestamp.toLocaleString('es-CL');
        const last = devs[devs.length - 1].timestamp.toLocaleString('es-CL');
        const maxVal = Math.max(...devs.map(d => d.value));
        return `${sensor}: ${devs.length} registro(s) > ${temperatureMax}°C (máx: ${maxVal}°C, desde ${first} hasta ${last})`;
      });

      return {
        status: 'no_cumple',
        detail: details.join(' | ') + ` (máx permitido: ${temperatureMax}°C)${excludedInfo}`,
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
      const hasRestriction = metadata?.energyRestriction;

      const significantGaps = gaps.filter(g => {
        if (g.hours <= maxGapHours) return false;
        if (hasRestriction && isGapDuringRestriction(g, metadata)) return false;
        return true;
      });

      const restrictionSkipped = hasRestriction ? gaps.filter(g => g.hours > maxGapHours && isGapDuringRestriction(g, metadata)).length : 0;
      const restrictionNote = restrictionSkipped > 0 ? ` (${restrictionSkipped} gap(s) durante restricción energética excluido(s))` : '';

      if (significantGaps.length === 0) {
        return { status: 'info', detail: `Registro continuo sin interrupciones significativas${restrictionNote}` };
      }

      const details = significantGaps.map(g =>
        `Desde ${g.start.toLocaleString('es-CL')} hasta ${g.end.toLocaleString('es-CL')} (${g.hours} horas)`
      );

      return {
        status: 'info',
        detail: `${significantGaps.length} interrupción(es) fuera de restricción: ${details.join('; ')}${restrictionNote}`,
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
        return { status: 'info', detail: 'Todos los sensores reportaron datos durante el tratamiento' };
      }

      return {
        status: 'info',
        detail: `Sensores sin datos suficientes: ${deadSensors.join(', ')}`,
      };
    },
  },

  {
    id: VALIDATION_IDS.TREATMENT_DURATION,
    name: 'Tiempo efectivo de tratamiento',
    evaluate(parsedData, protocol, metadata) {
      const { temperatureMin, temperatureTarget, temperatureMax, durationDays } = getProtocolTargets(protocol, metadata);
      const pulpaSensors = getActivePulpaSensors(parsedData, metadata);

      if (pulpaSensors.length === 0) {
        return { status: 'no_cumple', detail: 'No se detectaron sensores de pulpa' };
      }

      const treatmentStartIdx = findTreatmentStart(parsedData.records, pulpaSensors, 0);
      if (treatmentStartIdx === -1) {
        const firstRecord = parsedData.records[0];
        const lastRecord = parsedData.records[parsedData.records.length - 1];
        const sensorReadings = pulpaSensors.map(name => {
          const vals = parsedData.records.slice(0, 10).map(r => {
            const s = r.sensors[name];
            return s && s.isValid ? s.value : null;
          }).filter(v => v !== null);
          const lastVals = parsedData.records.slice(-10).map(r => {
            const s = r.sensors[name];
            return s && s.isValid ? s.value : null;
          }).filter(v => v !== null);
          return `${name}: primeros=[${vals.join(', ')}°C] últimos=[${lastVals.join(', ')}°C]`;
        }).join('\n    ');

        return {
          status: 'no_cumple',
          detail: `Nunca se alcanzó ≤ 0°C con TODOS los sensores de pulpa simultáneamente\n  Período: ${firstRecord.timestamp.toLocaleString('es-CL')} → ${lastRecord.timestamp.toLocaleString('es-CL')}\n  Sensores (${pulpaSensors.length}):\n    ${sensorReadings}\n  El tratamiento no pudo iniciarse.`,
        };
      }

      const treatmentStart = parsedData.records[treatmentStartIdx].timestamp;
      const { defrostSet, cycles } = getDefrostSet(parsedData.records, pulpaSensors, treatmentStartIdx, temperatureMax);

      const dailyStats = {};
      let effectiveMs = 0;
      let saturationMs = null;
      let saturationDate = null;
      let saturationRecordIdx = null;
      let lastValidTimestamp = null;
      let defrostMs = 0;
      const overMaxEvents = [];
      const gapEvents = [];
      let lastValidDay = null;
      const totalHoursRequired = durationDays * 24;
      const requiredMs = totalHoursRequired * 3600000;

      for (let i = treatmentStartIdx; i < parsedData.records.length; i++) {
        const record = parsedData.records[i];
        const dayKey = record.timestamp.toISOString().split('T')[0];
        if (!dailyStats[dayKey]) {
          dailyStats[dayKey] = { effectiveMs: 0, defrostMs: 0, overMaxCount: 0, overMaxTemps: [], totalReadings: 0, validReadings: 0, firstReading: null, lastReading: null, sensors: {} };
        }
        dailyStats[dayKey].totalReadings++;
        if (!dailyStats[dayKey].firstReading) dailyStats[dayKey].firstReading = record.timestamp;
        dailyStats[dayKey].lastReading = record.timestamp;

        pulpaSensors.forEach(name => {
          const s = record.sensors[name];
          if (s && s.isValid) {
            if (!dailyStats[dayKey].sensors[name]) dailyStats[dayKey].sensors[name] = { min: Infinity, max: -Infinity, sum: 0, count: 0 };
            const stats = dailyStats[dayKey].sensors[name];
            if (s.value < stats.min) stats.min = s.value;
            if (s.value > stats.max) stats.max = s.value;
            stats.sum += s.value;
            stats.count++;
          }
        });

        if (defrostSet.has(i)) {
          if (lastValidTimestamp !== null) defrostMs += record.timestamp.getTime() - lastValidTimestamp;
          lastValidTimestamp = null;
          continue;
        }

        const allBelowMax = pulpaSensors.every(name => {
          const s = record.sensors[name];
          return s && s.isValid && s.value <= temperatureMax;
        });

        if (allBelowMax) {
          dailyStats[dayKey].validReadings++;
          if (lastValidTimestamp !== null) {
            const diffMs = record.timestamp.getTime() - lastValidTimestamp;
            if (diffMs > 0 && diffMs < 6 * 60 * 60 * 1000) {
              effectiveMs += diffMs;
              dailyStats[dayKey].effectiveMs += diffMs;
            }
          }
          lastValidTimestamp = record.timestamp.getTime();
          lastValidDay = dayKey;
          if (saturationMs === null && effectiveMs >= requiredMs) {
            saturationMs = effectiveMs;
            saturationDate = record.timestamp;
            saturationRecordIdx = i;
          }
        } else {
          dailyStats[dayKey].overMaxCount++;
          const sensorsOver = pulpaSensors.filter(name => {
            const s = record.sensors[name];
            return s && s.isValid && s.value > temperatureMax;
          });
          const maxVal = sensorsOver.length > 0 ? Math.max(...sensorsOver.map(name => record.sensors[name].value)) : temperatureMax;
          dailyStats[dayKey].overMaxTemps.push(Math.round(maxVal * 10) / 10);
          if (saturationMs === null) {
            overMaxEvents.push({
              timestamp: record.timestamp,
              sensors: sensorsOver.map(name => `${name}: ${record.sensors[name].value}°C`),
              maxTemp: Math.round(maxVal * 10) / 10,
            });
          }
          lastValidTimestamp = null;
        }
      }

      for (let i = treatmentStartIdx + 1; i < parsedData.records.length; i++) {
        const diffMs = parsedData.records[i].timestamp.getTime() - parsedData.records[i - 1].timestamp.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours > 2) {
          gapEvents.push({
            from: parsedData.records[i - 1].timestamp,
            to: parsedData.records[i].timestamp,
            hours: Math.round(diffHours * 10) / 10,
          });
        }
      }

      const effectiveHours = effectiveMs / (1000 * 60 * 60);
      const effectiveDays = effectiveHours / 24;
      const defrostHours = defrostMs / (1000 * 60 * 60);
      const startStr = treatmentStart.toLocaleString('es-CL');

      const satDayEntries = Object.entries(dailyStats)
        .filter(([day]) => saturationDate === null || day <= saturationDate.toISOString().split('T')[0])
        .sort((a, b) => a[0].localeCompare(b[0]));
      const dayLines = satDayEntries.map(([day, stats]) => {
        const effH = (stats.effectiveMs / 3600000).toFixed(1);
        const overStr = stats.overMaxCount > 0 ? ` FUERA: ${stats.overMaxCount}x (máx: ${Math.max(...stats.overMaxTemps)}°C)` : '';
        const sensorSummary = pulpaSensors.map(name => {
          const s = stats.sensors[name];
          if (!s || s.count === 0) return `${name}: sin datos`;
          return `${name}: [${s.min}°C a ${s.max}°C]`;
        }).join(', ');
        return `  ${day}: ${effH}h | ${sensorSummary}${overStr}`;
      });

      const dayBreakdown = dayLines.length > 0 ? `\n  Desglose cumplimiento (${satDayEntries.length} días):\n${dayLines.join('\n')}` : '';

      let gapDetail = '';
      if (gapEvents.length > 0) {
        const satGaps = saturationDate ? gapEvents.filter(g => g.from <= saturationDate) : gapEvents;
        const gapLines = satGaps.slice(0, 10).map(g =>
          `  ${g.from.toLocaleString('es-CL')} → ${g.to.toLocaleString('es-CL')} (${g.hours}h)`
        ).join('\n');
        gapDetail = satGaps.length > 0 ? `\n  Huecos detectados (>2h sin datos):\n${gapLines}${satGaps.length > 10 ? `\n  ... y ${satGaps.length - 10} más` : ''}` : '';
      }

      let overMaxDetail = '';
      if (overMaxEvents.length > 0) {
        const first10 = overMaxEvents.slice(0, 10).map(e =>
          `  ${e.timestamp.toLocaleString('es-CL')} → ${e.sensors.join(', ')}`
        ).join('\n');
        overMaxDetail = `\n  Registros pulpa > ${temperatureMax}°C (antes de cumplimiento):\n${first10}${overMaxEvents.length > 10 ? `\n  ... y ${overMaxEvents.length - 10} más` : ''}`;
      }

      const extras = [];
      if (cycles.length > 0) extras.push(`Deshielos: ${defrostHours.toFixed(1)}h`);
      if (overMaxEvents.length > 0) extras.push(`Sobre máx: ${overMaxEvents.length} registro(s)`);
      if (gapEvents.length > 0) extras.push(`Huecos >2h: ${gapEvents.length}`);
      const extraInfo = extras.length > 0 ? `\n  Resumen: ${extras.join(' | ')}` : '';

      if (effectiveHours >= totalHoursRequired) {
        const satStr = saturationDate ? saturationDate.toLocaleString('es-CL') : 'N/A';
        const satDays = saturationDate ? ((saturationDate.getTime() - treatmentStart.getTime()) / (1000 * 60 * 60 * 24)).toFixed(1) : '?';
        const lastRecordTs = parsedData.records[parsedData.records.length - 1]?.timestamp;
        const hasPosterior = saturationDate && lastRecordTs && lastRecordTs > saturationDate;
        const totalNote = hasPosterior ? `\n  Total datos en archivo: ${effectiveDays.toFixed(1)} días efectivos (${effectiveHours.toFixed(0)}h) — incluye datos posteriores al cumplimiento` : '';
        return {
          status: 'cumple',
          detail: `APROBADO: ${durationDays} días requeridos completados (${totalHoursRequired}h efectivas ≤ ${temperatureMax}°C)\n  Período de tratamiento: ${startStr} → ${satStr} (${satDays} días calendario)${totalNote}${extraInfo}${dayBreakdown}${gapDetail}${overMaxDetail}`,
          params: { temperatureMin, temperatureTarget, temperatureMax, durationDays, effectiveDays: +effectiveDays.toFixed(1) },
        };
      }

      const missingHours = totalHoursRequired - effectiveHours;
      const lastRecord = parsedData.records[parsedData.records.length - 1];
      const lastDate = lastRecord.timestamp.toLocaleString('es-CL');

      return {
        status: 'no_cumple',
        detail: `${effectiveHours.toFixed(0)} horas efectivas vs ${totalHoursRequired}h requeridos (${durationDays} días) — faltan ${missingHours.toFixed(0)} horas\n  Máx permitido: ${temperatureMax}°C\n  Tratamiento desde: ${startStr}\n  Último registro: ${lastDate}${extraInfo}${dayBreakdown}${gapDetail}${overMaxDetail}`,
        deviations: overMaxEvents.map(e => ({
          sensor: e.sensors.join(', '),
          timestamp: e.timestamp,
          value: e.maxTemp,
          maxAllowed: temperatureMax,
        })),
        params: { temperatureMin, temperatureTarget, temperatureMax, durationDays, effectiveDays: +effectiveDays.toFixed(1) },
      };
    },
  },

  {
    id: VALIDATION_IDS.RECORDING_FREQUENCY,
    name: 'Frecuencia de registro',
    evaluate(parsedData, protocol, metadata) {
      const { recordingIntervalHours } = getProtocolTargets(protocol, metadata);
      const maxIntervalMs = recordingIntervalHours * 60 * 60 * 1000 * 1.5;
      const hasRestriction = metadata?.energyRestriction;
      let violations = 0;
      let restrictionSkipped = 0;

      for (let i = 1; i < parsedData.records.length; i++) {
        const diff = parsedData.records[i].timestamp.getTime() - parsedData.records[i - 1].timestamp.getTime();
        if (diff > maxIntervalMs) {
          if (hasRestriction && isDuringRestriction(parsedData.records[i - 1].timestamp, metadata)) {
            restrictionSkipped++;
            continue;
          }
          violations++;
        }
      }

      const restrictionNote = restrictionSkipped > 0 ? ` (${restrictionSkipped} intervalo(s) durante restricción excluido(s))` : '';
      const violationRate = violations / parsedData.records.length;

      if (violationRate < 0.05) {
        return {
          status: 'info',
          detail: `Frecuencia de registro adecuada (${parsedData.stats.totalRecords} registros)${restrictionNote}`,
        };
      }

      return {
        status: 'info',
        detail: `${violations} intervalos exceden la frecuencia máxima de ${recordingIntervalHours} hora(s)${restrictionNote}`,
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
          status: 'info',
          detail: `Suficiente: ${pulpaSensors.length} sensores de pulpa (requerido: ${minSensorsPulpa})`,
        };
      }

      return {
        status: 'info',
        detail: `Insuficiente: ${pulpaSensors.length} sensores de pulpa (requerido: ${minSensorsPulpa})`,
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

  {
    id: VALIDATION_IDS.DEFROST_CYCLES,
    name: 'Ciclos de deshielo (informativo)',
    evaluate(parsedData, protocol, metadata) {
      const pulpaSensors = getActivePulpaSensors(parsedData, metadata);
      if (pulpaSensors.length === 0) {
        return { status: 'info', detail: 'Sin sensores de pulpa para detectar deshielos' };
      }

      const treatmentStartIdx = findTreatmentStart(parsedData.records, pulpaSensors, 0);
      if (treatmentStartIdx === -1) {
        return { status: 'info', detail: 'Tratamiento no iniciado — no hay datos para analizar deshielos' };
      }

      const { temperatureMax } = getProtocolTargets(protocol, metadata);
      const cycles = detectDefrostCycles(parsedData.records, pulpaSensors, treatmentStartIdx, temperatureMax);

      if (cycles.length === 0) {
        return { status: 'info', detail: 'No se detectaron ciclos de deshielo durante el tratamiento' };
      }

      const totalDefrostMin = cycles.reduce((sum, c) => sum + c.durationMin, 0);
      const details = cycles.map((c, i) => {
        const start = c.start.toLocaleString('es-CL');
        const end = c.end.toLocaleString('es-CL');
        const ongoing = c.ongoing ? ' (en curso)' : '';
        return `Ciclo ${i + 1}: ${start} → ${end} (${c.durationMin} min, máx ${c.maxTemp}°C)${ongoing}`;
      });

      return {
        status: 'info',
        detail: `${cycles.length} ciclo(s) de deshielo detectado(s) — ${totalDefrostMin} min total. ${details.join(' | ')}`,
      };
    },
  },
];

export function evaluate(parsedData, protocol, metadata) {
  const targets = getProtocolTargets(protocol, metadata);

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
        params: result.params || null,
      };
    } catch (error) {
      return {
        id: v.id,
        name: v.name,
        status: 'error',
        detail: `Error al evaluar: ${error.message}`,
        deviations: null,
        value: null,
        params: null,
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
    summary: allPassed
      ? `Tratamiento APROBADO — ${passedCount}/${evaluableResults.length} validaciones cumplidas`
      : `${passedCount}/${evaluableResults.length} validaciones aprobadas — Requiere correcciones`,
    deviations: totalDeviations,
    params: {
      temperatureMin: targets.temperatureMin,
      temperatureTarget: targets.temperatureTarget,
      temperatureMax: targets.temperatureMax,
      durationDays: targets.durationDays,
      maxGapHours: targets.maxGapHours,
      recordingIntervalHours: targets.recordingIntervalHours,
      minSensorsPulpa: targets.minSensorsPulpa,
    },
  };
}
