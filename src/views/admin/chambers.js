import { requireAuth } from '../../auth/authGuard.js';
import { db } from '../../config/firebase.js';
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

export function renderChambers(container) {
  requireAuth(async (user) => {
    container.innerHTML = buildChambersHTML();
    attachChambersEvents(container, user);
    await loadChambers(container);
  });
}

function buildChambersHTML() {
  return `
    <div class="min-h-screen bg-gray-50">
      <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center h-16 gap-4">
            <a href="#/" class="text-gray-500 hover:text-gray-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </a>
            <span class="font-semibold">Administrar Cámaras</span>
          </div>
        </div>
      </nav>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-xl font-bold">Cámaras Frigoríficas</h1>
          <button id="addChamberBtn" class="btn-primary">+ Nueva Cámara</button>
        </div>

        <div id="chamberForm" class="card mb-6 hidden">
          <h3 class="font-semibold mb-4">Nueva Cámara</h3>
          <form id="saveChamberForm" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="label">Nombre *</label>
              <input type="text" id="chamberName" class="input-field" placeholder="Ej: CA-05" required />
            </div>
            <div>
              <label class="label">Tipo *</label>
              <select id="chamberType" class="input-field" required>
                <option value="convencional">Convencional</option>
                <option value="atmosfera_controlada">Atmósfera Controlada</option>
              </select>
            </div>
            <div>
              <label class="label">Almacenamiento *</label>
              <select id="chamberStorage" class="input-field" required>
                <option value="bins">Bins</option>
                <option value="embalada">Embalada</option>
              </select>
            </div>
            <div>
              <label class="label">Cantidad Sensores Pulpa</label>
              <input type="number" id="chamberSensorCount" class="input-field" value="2" />
            </div>
            <div>
              <label class="label">Frío en parte media del techo</label>
              <select id="chamberMidCeiling" class="input-field">
                <option value="false">No</option>
                <option value="true">Sí</option>
              </select>
            </div>
            <div class="flex items-end gap-3">
              <button type="button" id="cancelChamberForm" class="btn-secondary">Cancelar</button>
              <button type="submit" class="btn-success">Guardar</button>
            </div>
          </form>
        </div>

        <div class="card">
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Almacenamiento</th>
                  <th>Sensores Pulpa</th>
                  <th>Frio Techo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="chambersBody">
                <tr>
                  <td colspan="7" class="text-center py-8 text-gray-400">Cargando...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachChambersEvents(container, user) {
  const form = container.querySelector('#chamberForm');
  const addBtn = container.querySelector('#addChamberBtn');
  const cancelBtn = container.querySelector('#cancelChamberForm');
  const saveForm = container.querySelector('#saveChamberForm');

  addBtn.addEventListener('click', () => form.classList.toggle('hidden'));
  cancelBtn.addEventListener('click', () => form.classList.add('hidden'));

  saveForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newChamber = {
      name: container.querySelector('#chamberName').value,
      type: container.querySelector('#chamberType').value,
      fruitStorage: container.querySelector('#chamberStorage').value,
      sensorCount: parseInt(container.querySelector('#chamberSensorCount').value) || 2,
      hasMidCeiling: container.querySelector('#chamberMidCeiling').value === 'true',
      status: 'activa',
      createdBy: user.email,
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'chambers'), newChamber);
      form.classList.add('hidden');
      saveForm.reset();
      await loadChambers(container);
    } catch (error) {
      console.error('Error saving chamber:', error);
    }
  });
}

async function loadChambers(container) {
  try {
    const chambersRef = collection(db, 'chambers');
    const snapshot = await getDocs(chambersRef);
    const tbody = container.querySelector('#chambersBody');

    if (snapshot.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-8 text-gray-400">
            No hay cámaras registradas. Agregue una para comenzar.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = snapshot.docs.map(doc => {
      const c = doc.data();
      return `
        <tr>
          <td class="font-medium">${c.name}</td>
          <td>${c.type === 'convencional' ? 'Convencional' : 'Atm. Controlada'}</td>
          <td>${c.fruitStorage === 'bins' ? 'Bins' : 'Embalada'}</td>
          <td>${c.sensorCount}</td>
          <td>${c.hasMidCeiling ? 'Sí' : 'No'}</td>
          <td><span class="badge-success">${c.status}</span></td>
          <td>
            <button class="text-red-400 hover:text-red-600 text-sm delete-chamber" data-id="${doc.id}">Eliminar</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.delete-chamber').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta cámara?')) {
          await deleteDoc(doc(db, 'chambers', btn.dataset.id));
          await loadChambers(container);
        }
      });
    });
  } catch (error) {
    console.error('Error loading chambers:', error);
  }
}
