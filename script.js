// ================= CONFIGURACIÓN SUPABASE ================= //
const SUPABASE_URL = "https://xpxrhrncxkfkgavdsrsc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kihoxAj0CoPTAhvLux2SZw_tnWZzMVZ";

// Le cambiamos el nombre a 'clienteSupabase' para no chocar con la librería original
const clienteSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);



// ================= DATOS ================= //
const dbMayores = window.preseleccionesOficiales2027
    .filter(candidata => candidata.tipo === 'mayores')
    .map(({ tipo, ...candidata }) => candidata);
const dbInfantiles = window.preseleccionesOficiales2027
    .filter(candidata => candidata.tipo === 'infantiles')
    .map(({ tipo, ...candidata }) => candidata);

// ================= VARIABLES DE ESTADO ================= //
let usuarioActivo = null;
let modoActual = 'mayores'; 
let candidatasActivas = dbMayores;
let corteHonor = []; 
let elegidaFinal = null; 
let modoEleccion = false; 

// Estado y caché para "Ver tu quiniela"
let quinielaModalActual = null;
let categoriaModalQuiniela = 'mayores';
let cacheQuinielasUsuario = { mayores: null, infantiles: null };

function obtenerCandidataPorId(id) {
    if (!window.preseleccionesOficiales2027) return null;
    return window.preseleccionesOficiales2027.find(c => c.id === id) || null;
}

// ================= FUNCIONES DE AUTENTICACIÓN ================= //
async function registro() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
        alert("Por favor, rellena el email y la contraseña.");
        return;
    }

    const { data, error } = await clienteSupabase.auth.signUp({
        email: email,
        password: password,
    });

    if (error) {
        alert("Error en el registro: " + error.message);
    } else {
        alert("¡Registro correcto! Ya puedes iniciar sesión.");
    }
}

async function login() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    const { data, error } = await clienteSupabase.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        alert("Error al entrar: " + error.message);
    } else {
        usuarioActivo = data.user;
        actualizarInterfazAuth();
        precargarQuinielasUsuario();
        alert("Bienvenido, sesión iniciada.");
    }
}

async function logout() {
    await clienteSupabase.auth.signOut();
    usuarioActivo = null;
    cacheQuinielasUsuario = { mayores: null, infantiles: null };
    quinielaModalActual = null;
    cerrarModalMiQuiniela();
    actualizarInterfazAuth();
}

function actualizarInterfazAuth() {
    const divOut = document.getElementById('user-logged-out');
    const divIn = document.getElementById('user-logged-in');
    const textUser = document.getElementById('user-email-text');

    if (usuarioActivo) {
        divOut.style.display = 'none';
        divIn.style.display = 'flex';
        textUser.textContent = `Sesión: ${usuarioActivo.email}`;
    } else {
        divOut.style.display = 'flex';
        divIn.style.display = 'none';
    }
}

// Escuchar si el usuario ya tenía sesión iniciada al cargar la página
async function revisarSesion() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (session) {
        usuarioActivo = session.user;
        actualizarInterfazAuth();
        precargarQuinielasUsuario();
    }
}

// ================= GUARDAR EN LA NUBE ================= //
async function guardarQuinielaEnNube() {
    if (!usuarioActivo) {
        alert("Debes registrarte o iniciar sesión para guardar tu quiniela oficial.");
        return;
    }

    if (corteHonor.length < 13) {
        alert("Debes completar las 13 seleccionadas antes de guardar.");
        return;
    }

    const { data, error } = await clienteSupabase
        .from('quinielas')
        .upsert({
            user_id: usuarioActivo.id,
            user_email: usuarioActivo.email,
            tipo: modoActual,
            corte: corteHonor,
            elegida_final: elegidaFinal
        }, { onConflict: 'user_id,tipo' });

    if (error) {
        alert("No se pudo guardar: " + error.message);
    } else {
        cacheQuinielasUsuario[modoActual] = {
            user_id: usuarioActivo.id,
            user_email: usuarioActivo.email,
            tipo: modoActual,
            corte: [...corteHonor],
            elegida_final: elegidaFinal
        };
        alert("¡Tu quiniela oficial ha sido guardada en la base de datos de la comisión!\n\nPuedes consultarla cuando quieras desde el botón 'Ver tu quiniela'.");
    }
}

// ================= SISTEMA "VER TU QUINIELA" ================= //

async function precargarQuinielasUsuario() {
    if (!usuarioActivo) return;
    try {
        const { data, error } = await clienteSupabase
            .from('quinielas')
            .select('*')
            .eq('user_id', usuarioActivo.id);

        if (!error && data) {
            data.forEach(q => {
                if (q.tipo) cacheQuinielasUsuario[q.tipo] = q;
            });
        }
    } catch (err) {
        console.warn("No se pudieron precargar las quinielas del usuario:", err);
    }
}

async function abrirModalMiQuiniela(categoria = null) {
    if (!usuarioActivo) {
        alert("Debes registrarte o iniciar sesión para poder ver tu quiniela guardada.");
        const emailInput = document.getElementById('auth-email');
        if (emailInput) {
            emailInput.scrollIntoView({ behavior: 'smooth' });
            emailInput.focus();
        }
        return;
    }

    const modal = document.getElementById('modal-mi-quiniela');
    if (!modal) return;

    categoriaModalQuiniela = categoria || modoActual;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const titulo = document.getElementById('modal-quiniela-titulo');
    if (titulo) titulo.textContent = '📋 Tu Quiniela Oficial';

    const sub = document.getElementById('modal-quiniela-subtitulo');
    if (sub) sub.textContent = `Usuario: ${usuarioActivo.email}`;

    const tabs = document.querySelector('.modal-tabs');
    if (tabs) tabs.style.display = 'flex';

    actualizarTabsModalQuiniela();
    await renderizarCuerpoModalQuiniela();
}

function cerrarModalMiQuiniela() {
    const modal = document.getElementById('modal-mi-quiniela');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function cerrarModalSiFondo(event) {
    if (event.target && event.target.id === 'modal-mi-quiniela') {
        cerrarModalMiQuiniela();
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModalMiQuiniela();
    }
});

async function cambiarTabModalQuiniela(nuevaCategoria) {
    if (categoriaModalQuiniela === nuevaCategoria) return;
    categoriaModalQuiniela = nuevaCategoria;
    actualizarTabsModalQuiniela();
    await renderizarCuerpoModalQuiniela();
}

function actualizarTabsModalQuiniela() {
    const tabMayores = document.getElementById('modal-tab-mayores');
    const tabInfantiles = document.getElementById('modal-tab-infantiles');
    if (tabMayores) tabMayores.classList.toggle('activo', categoriaModalQuiniela === 'mayores');
    if (tabInfantiles) tabInfantiles.classList.toggle('activo', categoriaModalQuiniela === 'infantiles');
}

async function renderizarCuerpoModalQuiniela() {
    const contenedor = document.getElementById('modal-quiniela-cuerpo');
    const btnCargar = document.getElementById('btn-modal-cargar-tablero');
    const btnCompartir = document.getElementById('btn-modal-compartir');

    if (btnCargar) btnCargar.style.display = 'none';
    if (btnCompartir) btnCompartir.style.display = 'none';

    contenedor.innerHTML = `
        <div class="modal-cargando">
            <div class="spinner"></div>
            <p>Consultando tu quiniela oficial de ${categoriaModalQuiniela === 'mayores' ? 'Mayores' : 'Infantiles'}...</p>
        </div>
    `;

    let quiniela = cacheQuinielasUsuario[categoriaModalQuiniela];

    if (!quiniela) {
        const { data, error } = await clienteSupabase
            .from('quinielas')
            .select('*')
            .eq('user_id', usuarioActivo.id)
            .eq('tipo', categoriaModalQuiniela)
            .maybeSingle();

        if (error) {
            contenedor.innerHTML = `
                <div class="quiniela-vacia">
                    <p style="color: red;">Error al consultar la quiniela: ${error.message}</p>
                    <button onclick="renderizarCuerpoModalQuiniela()" class="btn-crear-quiniela">Reintentar</button>
                </div>
            `;
            return;
        }

        quiniela = data;
        if (quiniela) {
            cacheQuinielasUsuario[categoriaModalQuiniela] = quiniela;
        }
    }

    quinielaModalActual = quiniela;

    if (!quiniela || !quiniela.corte || quiniela.corte.length === 0) {
        const nombreCat = categoriaModalQuiniela === 'mayores' ? 'Mayores' : 'Infantiles';
        contenedor.innerHTML = `
            <div class="quiniela-vacia">
                <div class="icono-vacio">📝</div>
                <h3>No tienes quiniela registrada para ${nombreCat}</h3>
                <p>Aún no has guardado tu selección oficial de 13 candidatas en la base de datos.</p>
                <button onclick="irACrearQuiniela('${categoriaModalQuiniela}')" class="btn-crear-quiniela">
                    Hacer mi quiniela de ${nombreCat} ahora
                </button>
            </div>
        `;
        return;
    }

    renderizarCuerpoConDatos(quiniela, true);
}

function renderizarCuerpoConDatos(quiniela, esPropia = true) {
    const contenedor = document.getElementById('modal-quiniela-cuerpo');
    const btnCargar = document.getElementById('btn-modal-cargar-tablero');
    const btnCompartir = document.getElementById('btn-modal-compartir');

    if (btnCargar) btnCargar.style.display = 'inline-block';
    if (btnCompartir) btnCompartir.style.display = 'inline-block';

    const esMayores = (quiniela.tipo || categoriaModalQuiniela) === 'mayores';
    const tituloFM = esMayores ? 'Fallera Mayor de Valencia' : 'Fallera Mayor Infantil de Valencia';
    const elegidaId = quiniela.elegida_final;
    const candidataFM = elegidaId ? obtenerCandidataPorId(elegidaId) : null;

    let html = '';

    // 1. Tarjeta destacada de Fallera Mayor
    html += `
        <div class="quiniela-seccion-fmv">
            <span class="quiniela-fmv-badge">👑 ${tituloFM}</span>
    `;

    if (candidataFM) {
        html += `
            <div class="quiniela-fmv-card">
                <img class="quiniela-fmv-foto" src="${candidataFM.foto}" alt="${candidataFM.nombre}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100%\\' height=\\'100%\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23ccc\\'/></svg>'">
                <div class="quiniela-fmv-detalles">
                    <h3 class="quiniela-fmv-nombre">${candidataFM.nombre}</h3>
                    <p class="quiniela-fmv-falla">${candidataFM.falla}</p>
                    <p class="quiniela-fmv-sector">Sector: ${candidataFM.sector}</p>
                </div>
            </div>
        `;
    } else {
        html += `
            <p style="color: #666; margin: 10px 0;">No especificaste Fallera Mayor para esta quiniela (solo Corte de Honor).</p>
        `;
    }
    html += `</div>`;

    // 2. Cuadrícula de la Corte de Honor
    const totalCandidatas = (quiniela.corte || []).length;
    html += `
        <div class="quiniela-seccion-corte">
            <h3>
                <span>👑 Corte de Honor</span>
                <span style="font-size: 0.9rem; color: #666; font-weight: normal;">(${totalCandidatas} candidatas seleccionadas)</span>
            </h3>
            <div class="quiniela-corte-grid">
    `;

    (quiniela.corte || []).forEach(id => {
        const c = obtenerCandidataPorId(id);
        if (!c) return;

        const esLaFM = elegidaId === c.id;
        html += `
            <div class="quiniela-candidata-card ${esLaFM ? 'es-fmv' : ''}">
                ${esLaFM ? `<span class="quiniela-tag-fmv">👑 ${esMayores ? 'FMV' : 'FMIV'}</span>` : ''}
                <img class="quiniela-candidata-foto" src="${c.foto}" alt="${c.nombre}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100%\\' height=\\'100%\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23ccc\\'/></svg>'">
                <div class="quiniela-candidata-info">
                    <div class="quiniela-candidata-nombre" title="${c.nombre}">${c.nombre}</div>
                    <div class="quiniela-candidata-falla" title="${c.falla}">${c.falla}</div>
                    <div class="quiniela-candidata-sector">Sector: ${c.sector}</div>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    contenedor.innerHTML = html;
}

function irACrearQuiniela(categoria) {
    cerrarModalMiQuiniela();
    if (modoActual !== categoria) {
        cambiarCategoria(categoria);
    }
    if (!modoEleccion) {
        toggleModoEleccion();
    }
    const zona = document.getElementById('zona-eleccion');
    if (zona) {
        zona.scrollIntoView({ behavior: 'smooth' });
    }
}

function cargarQuinielaEnTableroDesdeModal() {
    if (!quinielaModalActual || !quinielaModalActual.corte) return;

    const tipoQuiniela = quinielaModalActual.tipo || categoriaModalQuiniela;
    if (modoActual !== tipoQuiniela) {
        cambiarCategoria(tipoQuiniela);
    }

    corteHonor = [...quinielaModalActual.corte];
    elegidaFinal = quinielaModalActual.elegida_final || null;

    guardarEstado();
    actualizarCuadroEleccion();
    renderizarTarjetas();

    if (!modoEleccion) {
        toggleModoEleccion();
    }

    cerrarModalMiQuiniela();

    const zona = document.getElementById('zona-eleccion');
    if (zona) {
        zona.scrollIntoView({ behavior: 'smooth' });
    }

    alert(`¡Tu quiniela oficial de ${tipoQuiniela === 'mayores' ? 'Mayores' : 'Infantiles'} se ha cargado en el tablero!`);
}

function compartirWhatsAppDesdeModal() {
    if (!quinielaModalActual || !quinielaModalActual.corte) return;

    const tipoQuiniela = quinielaModalActual.tipo || categoriaModalQuiniela;
    const esMayores = tipoQuiniela === 'mayores';
    const etiquetaRango = esMayores ? 'FMV' : 'FMIV';
    let texto = `👑 *Mi Quiniela Oficial para ${etiquetaRango} 2027* 👑\n\n*Corte de Honor:*\n`;

    quinielaModalActual.corte.forEach(id => {
        const c = obtenerCandidataPorId(id);
        if (c && quinielaModalActual.elegida_final !== id) {
            texto += `➖ ${c.nombre} (${c.falla})\n`;
        }
    });

    if (quinielaModalActual.elegida_final) {
        const cFinal = obtenerCandidataPorId(quinielaModalActual.elegida_final);
        if (cFinal) {
            const tituloGran = esMayores ? 'FALLERA MAYOR DE VALENCIA' : 'FALLERA MAYOR INFANTIL DE VALENCIA';
            texto += `\n🔥 *${tituloGran}:*\n✨ ${cFinal.nombre} (${cFinal.falla}) ✨\n`;
        }
    }

    texto += `\n📍 #FallaMinistro #${etiquetaRango}2027`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
}

function verQuinielaUsuarioRanking(email, usuario, corte, elegidaFinal) {
    const modal = document.getElementById('modal-mi-quiniela');
    if (!modal) return;

    categoriaModalQuiniela = modoActual;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const titulo = document.getElementById('modal-quiniela-titulo');
    if (titulo) titulo.textContent = `📋 Quiniela de ${usuario}`;

    const sub = document.getElementById('modal-quiniela-subtitulo');
    if (sub) sub.textContent = `Email: ${email} | Categoría: ${modoActual === 'mayores' ? 'Mayores' : 'Infantiles'}`;

    const tabs = document.querySelector('.modal-tabs');
    if (tabs) tabs.style.display = 'none';

    quinielaModalActual = {
        user_email: email,
        tipo: modoActual,
        corte: corte,
        elegida_final: elegidaFinal
    };

    renderizarCuerpoConDatos(quinielaModalActual, false);
}



// ================= LÓGICA DE CAMBIO DE MODO ================= //
function cambiarCategoria(nuevaCategoria) {
    if (modoActual === nuevaCategoria) return; // Si ya estamos ahí, no hacemos nada

    // 1. Guardar el progreso de la categoría actual antes de irnos
    guardarEstado();

    // 2. Cambiar las variables
    modoActual = nuevaCategoria;
    candidatasActivas = (modoActual === 'mayores') ? dbMayores : dbInfantiles;

    // 3. Modificar la interfaz visual (Colores y Textos)
    document.documentElement.style.setProperty('--color-tema', modoActual === 'mayores' ? '#800020' : '#0077b6');
    
    document.getElementById('titulo-app').textContent = modoActual === 'mayores' ? 'Probabilidad FMV 2027' : 'Probabilidad FMIV 2027';
    document.getElementById('texto-corte').textContent = modoActual === 'mayores' ? 'Corte de Honor' : 'Corte de Honor Infantil';
    document.getElementById('titulo-fmv').textContent = modoActual === 'mayores' ? 'Fallera Mayor de Valencia' : 'Fallera Mayor Infantil de Valencia';

    // 4. Actualizar el estilo de los botones superiores
    document.getElementById('btn-mayores').classList.toggle('activo', modoActual === 'mayores');
    document.getElementById('btn-infantiles').classList.toggle('activo', modoActual === 'infantiles');

    // 5. Cargar los datos de memoria de la nueva categoría y redibujar
    cargarEstado();
    inicializarFiltros();
    
    // Limpiar el buscador para evitar filtros residuales
    document.getElementById('buscador').value = ''; 
    
    actualizarCuadroEleccion();
    renderizarTarjetas();
}


// ================= MOTOR DE LA APP ================= //
function inicializarFiltros() {
    const selector = document.getElementById('filtro-sector');
    selector.innerHTML = '<option value="todos">Todos los sectores</option>'; // Resetear
    
    const sectoresUnicos = [...new Set(candidatasActivas.map(c => c.sector))];
    sectoresUnicos.forEach(sector => {
        const opcion = document.createElement('option');
        opcion.value = sector;
        opcion.textContent = sector;
        selector.appendChild(opcion);
    });
}

function calcularPesos() {
    let pesoTotal = 0;
    candidatasActivas.forEach(c => {
        let peso = c.notaEntrevista;
        c.pesoAsignado = peso;
        pesoTotal += peso;
    });

    candidatasActivas.forEach(c => {
        c.probabilidadFinal = (c.pesoAsignado / pesoTotal) * 100;
    });
}

function renderizarTarjetas() {
    calcularPesos();
    const contenedor = document.getElementById('grid-candidatas');
    const sectorSeleccionado = document.getElementById('filtro-sector').value;
    const textoBusqueda = document.getElementById('buscador').value.toLowerCase();
    
    contenedor.innerHTML = ''; 

    const filtradas = candidatasActivas.filter(c => {
        const coincideSector = sectorSeleccionado === 'todos' || c.sector === sectorSeleccionado;
        const coincideTexto = c.nombre.toLowerCase().includes(textoBusqueda) || 
                              c.falla.toLowerCase().includes(textoBusqueda);
        return coincideSector && coincideTexto;
    });

    if (filtradas.length === 0) {
        contenedor.innerHTML = '<p style="text-align:center; width:100%; color:#666;">No hay resultados.</p>';
        return;
    }

    filtradas.forEach(candidata => {
        const tarjeta = document.createElement('div');
        tarjeta.className = `candidata-card ${modoEleccion ? 'seleccionable' : ''}`;
        
        if (corteHonor.includes(candidata.id)) {
            tarjeta.classList.add('en-corte');
        }

        if (modoEleccion) {
            tarjeta.onclick = () => toggleCorte(candidata.id);
        }

        const etiquetaRango = modoActual === 'mayores' ? 'FMV' : 'FMIV';

        tarjeta.innerHTML = `
            <div class="imagen-container">
                <img src="${candidata.foto}" alt="${candidata.nombre}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100%\\' height=\\'100%\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23ccc\\'/></svg>'">
            </div>
            <div class="info-container">
                <h2 class="nombre-candidata">${candidata.nombre}</h2>
                <p class="falla-texto">${candidata.falla}</p>
                <p class="sector-texto">Sector: ${candidata.sector}</p>
                
                <div class="probabilidad-box">
                    <svg class="icono-bellota" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C8.686 2 6 4.686 6 8C6 8.58 6.082 9.141 6.234 9.672C5.503 10.378 5 11.365 5 12.5C5 14.985 7.015 17 9.5 17H14.5C16.985 17 19 14.985 19 12.5C19 11.365 18.497 10.378 17.766 9.672C17.918 9.141 18 8.58 18 8C18 4.686 15.314 2 12 2ZM12 4C14.209 4 16 5.791 16 8C16 8.173 15.986 8.343 15.961 8.508C15.65 8.188 15.281 7.925 14.863 7.734C14.004 7.342 13.033 7.125 12 7.125C10.967 7.125 9.996 7.342 9.137 7.734C8.719 7.925 8.35 8.188 8.039 8.508C8.014 8.343 8 8.173 8 8C8 5.791 9.791 4 12 4ZM9.5 15C8.119 15 7 13.881 7 12.5C7 11.554 7.525 10.732 8.324 10.301C9.406 10.748 10.655 11 12 11C13.345 11 14.594 10.748 15.676 10.301C16.475 10.732 17 11.554 17 12.5C17 13.881 15.881 15 14.5 15H9.5ZM11 18V21H13V18H11Z"/>
                    </svg>
                    <div class="porcentaje-wrapper">
                        <span class="numero-probabilidad">${candidata.probabilidadFinal.toFixed(1)}%</span>
                        <span class="label-probabilidad">Probabilidad ${etiquetaRango}</span>
                    </div>
                </div>
            </div>
        `;
        contenedor.appendChild(tarjeta);
    });
}

// ================= MODO ELECCIÓN Y CACHÉ ================= //
function toggleModoEleccion() {
    modoEleccion = !modoEleccion;
    const btn = document.getElementById('btn-eleccion');
    const zona = document.getElementById('zona-eleccion');
    const btnReiniciar = document.getElementById('btn-reiniciar');
    
    if (modoEleccion) {
        btn.textContent = "Desactivar Modo Elección";
        btn.classList.add('modo-activo');
        zona.classList.add('visible');
        if(btnReiniciar) btnReiniciar.style.display = "inline-block";
    } else {
        btn.textContent = "Activar Modo Elección";
        btn.classList.remove('modo-activo');
        zona.classList.remove('visible');
        if(btnReiniciar) btnReiniciar.style.display = "none";
    }
    renderizarTarjetas();
}

function toggleCorte(id) {
    const index = corteHonor.indexOf(id);
    if (index > -1) {
        corteHonor.splice(index, 1);
        if (elegidaFinal === id) elegidaFinal = null; 
    } else {
        if (corteHonor.length < 13) {
            corteHonor.push(id);
        } else {
            alert(`¡La Corte de Honor ya tiene a sus 13 candidatas!`);
            return;
        }
    }
    actualizarCuadroEleccion();
    renderizarTarjetas();
    guardarEstado();
}

function seleccionarFinal(id) {
    if (elegidaFinal === id) {
        elegidaFinal = null;
    } else {
        elegidaFinal = id;
    }
    actualizarCuadroEleccion();
    guardarEstado();
}

function eliminarDeCorte(evento, id) {
    evento.stopPropagation(); 
    toggleCorte(id); 
}

function actualizarCuadroEleccion() {
    document.getElementById('contador-corte').textContent = corteHonor.length;
    const gridCorte = document.getElementById('corte-grid');
    const spotFinal = document.getElementById('fmv-elegida');
    
    gridCorte.innerHTML = '';
    spotFinal.innerHTML = '<p style="color: #666;">Haz clic en una candidata de la Corte para elegirla</p>';

    corteHonor.forEach(id => {
        const c = candidatasActivas.find(cand => cand.id === id);
        if (!c) return;
        
        const div = document.createElement('div');
        div.className = 'miniatura-corte';
        div.onclick = () => seleccionarFinal(c.id);
        div.innerHTML = `
            <button class="btn-eliminar-corte" onclick="eliminarDeCorte(event, ${c.id})">✕</button>
            <img src="${c.foto}" alt="${c.nombre}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100%\\' height=\\'100%\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23ccc\\'/></svg>'">
            <p>${c.nombre.split(' ')[0]}</p>
        `;
        gridCorte.appendChild(div);

        if (elegidaFinal === id) {
            spotFinal.innerHTML = `
                <img src="${c.foto}" alt="${c.nombre}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100%\\' height=\\'100%\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23ccc\\'/></svg>'">
                <h3 style="color: var(--color-tema); margin: 10px 0 0 0;">${c.nombre}</h3>
                <p style="margin: 0; font-weight: bold;">${c.falla}</p>
            `;
        }
    });

    const divBotones = document.getElementById('botones-exportacion');
    divBotones.style.display = corteHonor.length > 0 ? 'flex' : 'none';
}

function guardarEstado() {
    const sufijo = modoActual === 'mayores' ? 'FMV' : 'FMIV';
    localStorage.setItem(`corteHonor_${sufijo}`, JSON.stringify(corteHonor));
    localStorage.setItem(`elegida_${sufijo}`, elegidaFinal ? elegidaFinal.toString() : 'null');
}

function cargarEstado() {
    const sufijo = modoActual === 'mayores' ? 'FMV' : 'FMIV';
    const guardadoCorte = localStorage.getItem(`corteHonor_${sufijo}`);
    const guardadaElegida = localStorage.getItem(`elegida_${sufijo}`);
    
    corteHonor = guardadoCorte ? JSON.parse(guardadoCorte) : [];
    elegidaFinal = (guardadaElegida && guardadaElegida !== 'null') ? parseInt(guardadaElegida) : null;
    
    if (corteHonor.length > 0 && !modoEleccion) {
        toggleModoEleccion();
    } else if (corteHonor.length === 0 && modoEleccion) {
        toggleModoEleccion(); // Se repliega si está vacía al cambiar de pestaña
    }
}

// ================= EXPORTACIÓN ================= //
function compartirWhatsApp() {
    if (corteHonor.length === 0) return;

    const etiquetaRango = modoActual === 'mayores' ? 'FMV' : 'FMIV';
    let texto = `👑 *Mi Quiniela para ${etiquetaRango} 2027* 👑\n\n*Corte de Honor:*\n`;
    
    corteHonor.forEach(id => {
        const c = candidatasActivas.find(cand => cand.id === id);
        if (c && elegidaFinal !== id) texto += `➖ ${c.nombre}\n`;
    });

    if (elegidaFinal) {
        const cFinal = candidatasActivas.find(cand => cand.id === elegidaFinal);
        const tituloGran = modoActual === 'mayores' ? 'FALLERA MAYOR DE VALENCIA' : 'FALLERA MAYOR INFANTIL DE VALENCIA';
        texto += `\n🔥 *${tituloGran}:*\n✨ ${cFinal.nombre} ✨\n`;
    }

    texto += `\n📍 #FallaMinistro #${etiquetaRango}2027`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
}

function descargarImagen() {
    if (corteHonor.length === 0) return;

    const zonaEleccion = document.getElementById('zona-eleccion');
    const botonesExportacion = document.getElementById('botones-exportacion');
    const btnEliminar = document.querySelectorAll('.btn-eliminar-corte');
    const etiquetaRango = modoActual === 'mayores' ? 'FMV' : 'FMIV';

    botonesExportacion.style.display = 'none';
    btnEliminar.forEach(btn => btn.style.display = 'none');

    html2canvas(zonaEleccion, { backgroundColor: "#ffffff", scale: 2 }).then(canvas => {
        const enlace = document.createElement('a');
        enlace.download = `Quiniela_${etiquetaRango}_2027.png`;
        enlace.href = canvas.toDataURL("image/png");
        enlace.click();

        botonesExportacion.style.display = 'flex';
        btnEliminar.forEach(btn => btn.style.display = 'flex');
    });
}

function reiniciarEleccion() {
    if(confirm("¿Estás seguro de que quieres borrar la selección actual?")) {
        corteHonor = [];
        elegidaFinal = null;
        guardarEstado();
        actualizarCuadroEleccion();
        renderizarTarjetas();
    }
}

// Inicialización de arranque
window.onload = async () => {
    await revisarSesion();
    inicializarFiltros();
    cargarEstado(); 
    actualizarCuadroEleccion();
    renderizarTarjetas();
};

// ================= SISTEMA DE CLASIFICACIÓN (RANKING) ================= //

// ¡OJO! Aquí pondrás los IDs reales la noche de la Fonteta. 
// Mientras estén vacíos, todos tendrán 0 puntos. Puedes probar a poner IDs de tu lista para ver cómo suma.
const resultadosOficiales = {
    mayores: {
        corte: [], 
        fmv: null  // El ID de la elegida
    },
    infantiles: {
        corte: [], // Pon aquí los 13 IDs de las infantiles
        fmv: null 
    }
};

let mostrandoRanking = false;

async function toggleClasificacion() {
    mostrandoRanking = !mostrandoRanking;
    
    const zonaRanking = document.getElementById('zona-clasificacion');
    const controles = document.querySelector('.controles-container');
    const zonaEleccion = document.getElementById('zona-eleccion');
    const gridCandidatas = document.getElementById('grid-candidatas');
    
    if (mostrandoRanking) {
        // Ocultar la app principal y mostrar ranking
        controles.style.display = 'none';
        zonaEleccion.style.display = 'none';
        gridCandidatas.style.display = 'none';
        zonaRanking.style.display = 'block';
        
        document.getElementById('ranking-modo-texto').textContent = modoActual === 'mayores' ? 'Mayores' : 'Infantiles';
        await cargarRanking();
    } else {
        // Volver a la app principal
        controles.style.display = 'flex';
        if (corteHonor.length > 0) zonaEleccion.style.display = 'block';
        gridCandidatas.style.display = 'grid';
        zonaRanking.style.display = 'none';
    }
}

async function cargarRanking() {
    const contenedorTabla = document.getElementById('tabla-ranking-container');
    contenedorTabla.innerHTML = '<p>Cargando datos de la Fonteta...</p>';

    // 1. Descargar todas las quinielas de la categoría actual desde Supabase
    const { data: quinielas, error } = await clienteSupabase
        .from('quinielas')
        .select('user_email, corte, elegida_final')
        .eq('tipo', modoActual);

    if (error) {
        contenedorTabla.innerHTML = `<p style="color:red;">Error al cargar: ${error.message}</p>`;
        return;
    }

    if (!quinielas || quinielas.length === 0) {
        contenedorTabla.innerHTML = '<p>Aún no hay quinielas registradas en esta categoría.</p>';
        return;
    }

    const oficial = resultadosOficiales[modoActual];

    // 2. Calcular puntos para cada usuario
    const ranking = quinielas.map(q => {
        let puntos = 0;
        
        // Sumar 1 punto por cada acierto en la Corte
        if (oficial.corte.length > 0 && Array.isArray(q.corte)) {
            q.corte.forEach(id => {
                if (oficial.corte.includes(id)) puntos += 1;
            });
        }
        
        // Sumar 5 puntos por acertar la FMV/FMIV
        if (oficial.fmv && q.elegida_final === oficial.fmv) {
            puntos += 5;
        }

        return {
            email: q.user_email || '',
            usuario: q.user_email ? q.user_email.split('@')[0] : 'Anónimo',
            puntos: puntos,
            corte: Array.isArray(q.corte) ? q.corte : [],
            elegida_final: q.elegida_final || null
        };
    });

    // 3. Ordenar de mayor a menor puntuación
    ranking.sort((a, b) => b.puntos - a.puntos);

    // 4. Construir la tabla HTML
    let htmlTabla = `
        <table class="tabla-ranking">
            <thead>
                <tr>
                    <th>Posición</th>
                    <th>Fallero/a</th>
                    <th>Puntuación</th>
                    <th>Elecciones</th>
                </tr>
            </thead>
            <tbody>
    `;

    ranking.forEach((r, index) => {
        let medalla = `${index + 1}º`;
        if (index === 0) medalla = '🥇';
        if (index === 1) medalla = '🥈';
        if (index === 2) medalla = '🥉';

        const esMiUsuario = usuarioActivo && r.email && r.email.toLowerCase() === usuarioActivo.email.toLowerCase();
        const jsonCorte = JSON.stringify(r.corte).replace(/"/g, '&quot;');
        const elegidaParam = r.elegida_final !== null ? r.elegida_final : 'null';

        htmlTabla += `
            <tr style="${esMiUsuario ? 'background-color: #fff9e6; font-weight: 500;' : ''}">
                <td style="font-weight:bold; font-size:1.2rem;">${medalla}</td>
                <td>
                    ${r.usuario}
                    ${esMiUsuario ? '<span style="background: var(--dorado); color: var(--color-tema); font-size: 0.75rem; padding: 2px 7px; border-radius: 10px; margin-left: 6px; font-weight: bold;">Tú</span>' : ''}
                </td>
                <td style="font-weight:bold; color:var(--color-tema);">${r.puntos} pts</td>
                <td>
                    <button class="btn-ver-quiniela" onclick="verQuinielaUsuarioRanking('${r.email}', '${r.usuario}', ${jsonCorte}, ${elegidaParam})" style="padding: 5px 12px; font-size: 0.85rem; border-radius: 6px; cursor: pointer;">
                        👁️ Ver elecciones
                    </button>
                </td>
            </tr>
        `;
    });

    htmlTabla += `</tbody></table>`;
    contenedorTabla.innerHTML = htmlTabla;
}
