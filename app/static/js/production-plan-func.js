// ===============================================================
//  PRIORIDADES
// ===============================================================
const priority = [
    '1era', '2da', '3era', '4ta', '5ta', '6ta', '7ma', '8va', '9na', '10ma',
    '11va', '12va', '13ra', '14ta', '15ta', '16ta', '17ma', '18va', '19na', '20ma',
    '21va', '22va', '23ra', '24ta', '25ta', '26ta', '27ma', '28va', '29na', '30ma'
];


// ===============================================================
//  DOM READY
// ===============================================================
document.addEventListener("DOMContentLoaded", () => {
    const tbody = document.querySelector("#production-table tbody");
    const completedTbody = document.querySelector("#completed-table tbody");

    const addJobButton = document.getElementById("add-job-button");
    const ajJob = document.getElementById("aj-job");
    const ajReq = document.getElementById("aj-req");

    addJobButton.addEventListener("click", () => {
        const formNewJob = {
            job: ajJob.value.trim(),
            req: ajReq.value.trim(),
            comment: "",
            qty: 0,
            pan: window.filters.pan,
            shift: window.filters.shift,
            date: window.filters.date
        };

        agregarJob(formNewJob, tbody, ajJob, ajReq);
    });

    initDragAndDrop(tbody);

    // Esperar a que se defina window.filters.pan
    const interval = setInterval(() => {
        if (window.filters?.pan) {
            clearInterval(interval);
            loadPlanProductionJobs(tbody);
            loadClosedJobs(completedTbody, 10);
        }
    }, 100);
});


// ===============================================================
//  HELPERS
// ===============================================================
function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDateTime(dtString) {
    if (!dtString) return "";
    try {
        const d = new Date(dtString.replace(" ", "T"));
        if (isNaN(d)) return dtString;
        return d.toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    } catch (e) {
        return dtString;
    }
}


// ===============================================================
//  AGREGAR JOB
// ===============================================================
function agregarJob(formNewJob, tbody, ajJob, ajReq) {
    fetch("/production-plan/add-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formNewJob)
    })
        .then(response => response.json())
        .then(data => {
            if (data.status !== "success") {
                return showToast(data.message || "Error al agregar el trabajo.", false);
            }

            const id = data.id;
            const newRow = crearFilaJob(id, formNewJob);
            tbody.appendChild(newRow);

            actualizarPrioridades(tbody);
            showToast("Trabajo agregado exitosamente.", true);

            ajJob.value = "";
            ajReq.value = "";

            agregarEventoEliminar(newRow);
        })
        .catch(error => showToast(error || "Error al agregar el trabajo.", false));
}


// ===============================================================
//  CREAR FILA OPEN JOBS
// ===============================================================
function crearFilaJob(id, form) {
    const tr = document.createElement("tr");
    tr.id = `job-row-${id}`;
    tr.dataset.jobId = id;
    tr.draggable = true;

    tr.innerHTML = `
        <td class="drag-cell"></td>
        <td class="priority"></td>
        <td>${form.job}</td>
        <td>${form.req}</td>
        <td><input type="number" name="${id}_actual_quantity" class="actual-qty" id="${id}_actual_quantity" value="${form.qty}"></td>
        <td class="delta">${form.qty - form.req}</td>
        <td>
            <textarea name="comments" class="comments" id="${id}_comments" rows="1">${form.comment}</textarea>
        </td>
        <td class="action-td">
            <div class="action-button delete-job-button" 
                 id="${id}_delete_job"
                 title="Eliminar Job Order del plan de producción"
                 data-job-id="${id}">
                <img src="/static/svg/action-close-red.svg" alt="Eliminar">
            </div>
        </td>
    `;

    agregarEventosDeEdicion(tr);

    return tr;
}


// ===============================================================
//  CREAR FILA COMPLETED
// ===============================================================
function crearFilaCompleted(job) {
    const tr = document.createElement("tr");
    tr.dataset.jobId = job.id;

    const actualQty = job.actual_quantity ?? 0;
    const delta = Number(actualQty) - (job.required_quantity ?? 0);

    tr.innerHTML = `
        <td>${escapeHtml(job.job_order)}</td>
        <td>${job.required_quantity ?? ""}</td>
        <td>${actualQty}</td>
        <td class="delta">${delta}</td>
        <td>
            <input type="text" name="comments" class="completed-comments"
                   value="${escapeHtml(job.comments ?? "")}">
        </td>
        <td class="closed-at">${formatDateTime(job.closed_at)}</td>
        <td class="action-td">
            <div class="action-button delete-completed-button"
                 title="Eliminar Job Order"
                 data-job-id="${job.id}">
                <img src="/static/svg/action-close-red.svg" alt="Eliminar">
            </div>
        </td>
    `;

    // Evento eliminar
    tr.querySelector(".delete-completed-button").addEventListener("click", () => {
        deleteJob(job.id, tr);
    });

    // Evento editar comentarios
    tr.querySelector(".completed-comments").addEventListener("change", (evt) => {
        updateJobData(job.id, "comments", evt.target.value.trim());
    });

    return tr;
}


// ===============================================================
//  FUNCIÓN MODULAR: ELIMINAR JOB (OPEN O COMPLETED)
// ===============================================================
async function deleteJob(jobId, rowElement) {

    const accept = await customConfirm(
        "¿Estás seguro de que deseas eliminar este trabajo? Esta acción no se puede deshacer.",
        "Confirmar eliminación"
    );
    if (!accept) return;

    try {
        const response = await fetch("/production-plan/delete-job", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: jobId })
        });

        const data = await response.json();

        if (data.status !== "success") {
            return showToast(data.message || "Error al eliminar el trabajo.", false);
        }

        // Eliminar fila visual
        rowElement.remove();

        // Recalcular prioridades solo si es tabla OPEN
        const tbody = document.querySelector("#production-table tbody");
        if (tbody.contains(rowElement)) {
            actualizarPrioridades(tbody);
        }

        showToast("Trabajo eliminado exitosamente.", true);

    } catch (error) {
        showToast(error || "Error al eliminar el trabajo.", false);
    }
}


// ===============================================================
//  ELIMINAR OPEN JOB
// ===============================================================
function agregarEventoEliminar(row) {
    const deleteBtn = row.querySelector(".delete-job-button");

    deleteBtn.addEventListener("click", () => {
        const jobId = row.dataset.jobId;
        deleteJob(jobId, row);
    });
}


// ===============================================================
//  EDITAR OPEN JOB
// ===============================================================
async function agregarEventosDeEdicion(row) {
    const jobId = row.dataset.jobId;

    const actualQtyInput = row.querySelector(".actual-qty");
    actualQtyInput.addEventListener("change", async () => {
        const value = Number(actualQtyInput.value);

        updateJobData(jobId, "actual_quantity", value);

        const req = Number(row.children[3].innerText);

        if ((value - req) >= 0) {

            const confirm = await customConfirm("La cantidad actual es mayor o igual a la cantidad requerida. ¿Deseas marcar este job como completado?", "Marcar como completado");

            if (!confirm) {
                actualQtyInput.value = actualQtyInput.dataset.prevValue || 0;
                return;
            }

            const completedTbody = document.querySelector("#completed-table tbody");
            const completedRow = crearFilaCompleted({
                id: jobId,
                job_order: row.children[2].innerText,
                required_quantity: req,
                actual_quantity: value,
                comments: row.querySelector(".comments").value.trim(),
                closed_at: new Date().toISOString().slice(0, 19).replace("T", " ")
            });
            completedTbody.prepend(completedRow);
            row.remove();            
            actualizarPrioridades(document.querySelector("#production-table tbody"));
            showToast("Job marcado como completado.", true);
        }

        row.querySelector(".delta").innerText = (value - req);
        actualQtyInput.dataset.prevValue = value;
    });

    const commentsInput = row.querySelector(".comments");
    commentsInput.addEventListener("change", () => {
        updateJobData(jobId, "comments", commentsInput.value.trim());
    });

    commentsInput.addEventListener("input", () => {
        commentsInput.style.height = "auto";
        commentsInput.style.height = commentsInput.scrollHeight + "px";
    });
}


// ===============================================================
//  DRAG & DROP
// ===============================================================
function initDragAndDrop(tbody) {
    let draggedRow = null;

    tbody.addEventListener("dragstart", (e) => {
        draggedRow = e.target.closest("tr");
        draggedRow.style.opacity = "0.4";
    });

    tbody.addEventListener("dragend", (e) => {
        e.target.style.opacity = "";
        actualizarPrioridades(tbody);
    });

    tbody.addEventListener("dragover", (e) => {
        e.preventDefault();
        const targetRow = e.target.closest("tr");
        if (!targetRow || targetRow === draggedRow) return;

        const rect = targetRow.getBoundingClientRect();
        const isAfter = e.clientY > rect.top + rect.height / 2;

        isAfter ? targetRow.after(draggedRow) : targetRow.before(draggedRow);
    });

    document.documentElement.addEventListener("dragover", e => e.preventDefault());
}


// ===============================================================
//  PRIORIDADES
// ===============================================================
function actualizarPrioridades(tbody) {
    const priorityCells = tbody.querySelectorAll("tr .priority");

    priorityCells.forEach((cell, index) => {
        cell.innerText = priority[index] || `${index + 1}era`;
        updateJobPriority(cell.closest("tr").dataset.jobId, index + 1);
    });
}


// ===============================================================
//  CARGAR OPEN JOBS
// ===============================================================
function loadPlanProductionJobs(tbody) {
    const pan = window.filters.pan;

    fetch(`/production-plan/${pan}/jobs/open`)
        .then(res => res.json())
        .then(data => {
            if (data.status !== "success") {
                return showToast(data.message || "Error al cargar trabajos.", false);
            }

            const jobs = data.data;

            tbody.innerHTML = "";

            jobs.forEach(job => {
                const form = {
                    job: job.job_order,
                    req: job.required_quantity,
                    qty: job.actual_quantity || 0,
                    comment: job.comments || "",
                };

                const row = crearFilaJob(job.id, form);

                tbody.appendChild(row);
                agregarEventoEliminar(row);
            });

            actualizarPrioridades(tbody);

            showToast("Jobs cargados.", true);
        })
        .catch(error => showToast(error || "Error al cargar los trabajos.", false));
}


// ===============================================================
//  CARGAR COMPLETED JOBS
// ===============================================================
function loadClosedJobs(tbodyCompleted, limit = 10) {
    const pan = window.filters.pan;
    if (!pan) return;

    fetch(`/production-plan/${pan}/jobs/closed?limit=${limit}`)
        .then(res => res.json())
        .then(data => {
            if (data.status !== "success") {
                return showToast(data.message || "Error al cargar trabajos completados.", false);
            }

            const jobs = data.data || [];

            tbodyCompleted.innerHTML = "";

            jobs.forEach(job => {
                const row = crearFilaCompleted(job);
                tbodyCompleted.appendChild(row);
            });

            showToast("Completed jobs cargados.", true);
        })
        .catch(err => showToast(err || "Error al cargar trabajos completados.", false));
}


// ===============================================================
//  ACTUALIZAR CAMPOS
// ===============================================================
function updateJobData(jobId, field, value) {
    fetch(`/production-plan/update-job-data/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status !== "success") {
                return showToast(data.message || "Error al actualizar los datos del trabajo.", false);
            }
            showToast("Datos del trabajo actualizados exitosamente.", true);
        })
        .catch(error => showToast(error || "Error al actualizar los datos del trabajo.", false));
}


// ===============================================================
//  ACTUALIZAR PRIORIDAD
// ===============================================================
function updateJobPriority(jobId, newPriority) {
    fetch(`/production-plan/update-job-priorities/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_priorities: newPriority })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status !== "success") {
                return showToast(data.message || "Error al actualizar la prioridad del trabajo.", false);
            }
            showToast("Prioridad del trabajo actualizada exitosamente.", true);
        })
        .catch(error => showToast(error || "Error al actualizar la prioridad del trabajo.", false));
}

