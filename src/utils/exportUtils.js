import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { TREATMENT_TYPES } from '../config/sagData.js';

export function exportProtocolPDF(protocol, filename) {
  const doc = new jsPDF();
  const f = filename || `Protocolo_${protocol.pais}_${protocol.producto}.pdf`.replace(/\s+/g, '_');

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(`Protocolo Fitosanitario`, 14, 20);
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text(`${protocol.pais} - ${protocol.producto}`, 14, 28);

  let y = 40;

  const addSection = (title, items) => {
    if (!items?.length) return;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text(title, 14, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    items.forEach(item => {
      if (y > 280) { doc.addPage(); y = 20; }
      const text = typeof item === 'string' ? item : item.text || JSON.stringify(item);
      const lines = doc.splitTextToSize(`• ${text}`, 180);
      lines.forEach(line => { doc.text(line, 18, y); y += 5; });
      y += 1;
    });
    y += 4;
  };

  const infoData = [
    ['País Destino:', protocol.pais],
    ['Organismo:', protocol.organismo_destino || '-'],
    ['Programa:', protocol.programa || '-'],
    ['Producto:', protocol.producto],
    ['Familia:', protocol.familia || '-'],
    ['Categoría SDP:', protocol.categoria_SDP || '-'],
    ['Variedades:', (protocol.variedades || []).join(', ') || '-'],
    ['Vigente:', protocol.vigente ? 'Sí' : 'No'],
    ['Versión:', protocol.version || '-'],
  ];

  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 64, 175);
  doc.text('Información General', 14, y);
  doc.setTextColor(0, 0, 0);
  y += 7;

  doc.setFontSize(10);
  infoData.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, 18, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(value), 55, y);
    y += 6;
  });
  y += 4;

  if (protocol.objetivo) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text('Objetivo', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    const objLines = doc.splitTextToSize(protocol.objetivo, 180);
    objLines.forEach(line => { doc.text(line, 18, y); y += 5; });
    y += 4;
  }

  if (protocol.descripcion_protocolo?.length) {
    addSection('Descripción del Protocolo', protocol.descripcion_protocolo);
  }

  addSection('Requisitos', protocol.requisitos);
  addSection('Controles Fitosanitarios', protocol.controles);
  addSection('Documentación Requerida', protocol.documentacion);
  addSection('Checklist de Exportación', protocol.checklist_exportacion);

  if (protocol.tratamientos?.length) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text('Tratamientos Requeridos', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 7;
    protocol.tratamientos.forEach(t => {
      const ti = TREATMENT_TYPES[t.tipo] || { name: t.tipo };
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
      doc.text(`• ${ti.name} ${t.aplica ? '(Aplica)' : '(No aplica)'}`, 18, y);
      y += 5;
      if (t.registro?.length) {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`  Registro: ${t.registro.join(', ')}`, 18, y);
        doc.setTextColor(0);
        y += 5;
      }
    });
    y += 4;
  }

  if (protocol.registros_obligatorios?.length) {
    addSection('Registros Obligatorios',
      protocol.registros_obligatorios.map(r => `${r.tipo}: ${(r.campos || []).join(', ')}`)
    );
  }

  if (protocol.observaciones) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text('Observaciones', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    const obs = doc.splitTextToSize(protocol.observaciones, 180);
    obs.forEach(line => { doc.text(line, 18, y); y += 5; });
  }

  doc.save(f);
}

export function exportProtocolExcel(protocol, filename) {
  const f = filename || `Protocolo_${protocol.pais}_${protocol.producto}.xlsx`.replace(/\s+/g, '_');

  const rows = [
    ['PROTOCOL FITOSANITARIO'],
    [],
    ['País Destino', protocol.pais],
    ['Organismo', protocol.organismo_destino || ''],
    ['Programa', protocol.programa || ''],
    ['Producto', protocol.producto],
    ['Familia', protocol.familia || ''],
    ['Categoría SDP', protocol.categoria_SDP || ''],
    ['Variedades', (protocol.variedades || []).join(', ')],
    ['Vigente', protocol.vigente ? 'Sí' : 'No'],
    ['Versión', protocol.version || ''],
    [],
  ];

  if (protocol.objetivo) {
    rows.push(['OBJETIVO'], [protocol.objetivo], []);
  }
  if (protocol.descripcion_protocolo?.length) {
    rows.push(['DESCRIPCIÓN DEL PROTOCOLO']);
    protocol.descripcion_protocolo.forEach(d => rows.push([d]));
    rows.push([]);
  }

  rows.push(
    ['REQUISITOS'],
    ...(protocol.requisitos || []).map((r, i) => [i + 1, r]),
    [],
    ['CONTROLES FITOSANITARIOS'],
    ...(protocol.controles || []).map((c, i) => [i + 1, c]),
    [],
    ['TRATAMIENTOS'],
    ...(protocol.tratamientos || []).map(t => {
      const ti = TREATMENT_TYPES[t.tipo] || { name: t.tipo };
      return [ti.name, t.aplica ? 'Aplica' : 'No aplica', (t.registro || []).join(', ')];
    }),
    [],
    ['DOCUMENTACIÓN'],
    ...(protocol.documentacion || []).map((d, i) => [i + 1, d]),
    [],
    ['CHECKLIST DE EXPORTACIÓN'],
    ...(protocol.checklist_exportacion || []).map((c, i) => ['☐', c.replace(/^[☐✓✗]\s*/, '')]),
    [],
    ['REGISTROS OBLIGATORIOS'],
    ...(protocol.registros_obligatorios || []).map(r => [r.tipo, (r.campos || []).join(', ')]),
  );

  if (protocol.observaciones) {
    rows.push([], ['OBSERVACIONES'], [protocol.observaciones]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Protocolo');
  XLSX.writeFile(wb, f);
}

export function exportAllProtocolsPDF(protocols, filename) {
  const doc = new jsPDF();
  const f = filename || 'Todos_los_Protocolos_SAG.pdf';

  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Protocolos Fitosanitarios SAG', 14, 20);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Total: ${protocols.length} protocolo(s) · Generado: ${new Date().toLocaleDateString('es-CL')}`, 14, 28);

  let y = 40;

  protocols.forEach((proto, idx) => {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFillColor(240, 245, 255);
    doc.rect(14, y - 5, 182, 10, 'F');
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(`${idx + 1}. ${proto.pais} - ${proto.producto} (SDP ${proto.categoria_SDP || '-'})`, 16, y);
    y += 8;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    if (proto.familia) { doc.text(`Familia: ${proto.familia}`, 20, y); y += 5; }
    if (proto.variedades?.length) {
      const vt = doc.splitTextToSize(`Variedades: ${proto.variedades.join(', ')}`, 170);
      vt.forEach(l => { doc.text(l, 20, y); y += 4; });
    }
    if (proto.requisitos?.length) {
      doc.setFont(undefined, 'bold');
      doc.text(`Requisitos (${proto.requisitos.length}):`, 20, y); y += 4;
      doc.setFont(undefined, 'normal');
      proto.requisitos.slice(0, 3).forEach(r => {
        if (y > 280) { doc.addPage(); y = 20; }
        const lines = doc.splitTextToSize(`  • ${r}`, 170);
        lines.forEach(l => { doc.text(l, 20, y); y += 4; });
      });
      if (proto.requisitos.length > 3) {
        doc.text(`  ... y ${proto.requisitos.length - 3} más`, 20, y); y += 4;
      }
    }
    if (proto.checklist_exportacion?.length) {
      doc.setFont(undefined, 'bold');
      doc.text(`Checklist (${proto.checklist_exportacion.length} ítems):`, 20, y); y += 4;
      doc.setFont(undefined, 'normal');
      proto.checklist_exportacion.slice(0, 3).forEach(c => {
        doc.text(`  ☐ ${c.replace(/^[☐✓✗]\s*/, '')}`, 20, y); y += 4;
      });
      if (proto.checklist_exportacion.length > 3) {
        doc.text(`  ... y ${proto.checklist_exportacion.length - 3} más`, 20, y); y += 4;
      }
    }
    y += 6;
  });

  doc.save(f);
}

export function exportAllProtocolsExcel(protocols, filename) {
  const f = filename || 'Todos_los_Protocolos_SAG.xlsx';

  const rows = [
    ['PAÍS', 'PRODUCTO', 'FAMILIA', 'SDP', 'VIGENTE', 'ORGANISMO', 'VARIEDADES', 'REQUISITOS', 'CHECKLIST', 'TRATAMIENTOS', 'DOCUMENTACIÓN'],
    ...protocols.map(p => [
      p.pais,
      p.producto,
      p.familia || '',
      p.categoria_SDP || '',
      p.vigente ? 'Sí' : 'No',
      p.organismo_destino || '',
      (p.variedades || []).join('; '),
      (p.requisitos || []).length,
      (p.checklist_exportacion || []).length,
      (p.tratamientos || []).map(t => {
        const ti = TREATMENT_TYPES[t.tipo] || { name: t.tipo };
        return ti.name;
      }).join('; '),
      (p.documentacion || []).length,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 6 },
    { wch: 8 }, { wch: 20 }, { wch: 40 },
    { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Protocolos');
  XLSX.writeFile(wb, f);
}
