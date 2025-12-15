// ===============================================================
//  PRIORITIES
// ===============================================================
// The 'priority' array is now loaded from window.translations.priorities_array

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
                return showToast(data.message || window.translations.add_job_error, false);
            }

            const id = data.id;
            const newRow = crearFilaJob(id, formNewJob);
            tbody.appendChild(newRow);

            actualizarPrioridades(tbody);
            showToast(window.translations.add_job_success, true);

            ajJob.value = "";
            ajReq.value = "";

            agregarEventoEliminar(newRow);
        })
        .catch(error => showToast(error || window.translations.add_job_error, false));
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
                 title="${window.translations.delete_job_title}"
                 data-job-id="${id}">
                <img src="/static/svg/action-close-red.svg" alt="${window.translations.delete_alt}">
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
                 title="${window.translations.delete_completed_job_title}"
                 data-job-id="${job.id}">
                <img src="/static/svg/action-close-red.svg" alt="${window.translations.delete_alt}">
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
        window.translations.delete_job_confirm_text,
        window.translations.delete_job_confirm_title
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
            return showToast(data.message || window.translations.delete_job_error, false);
        }

        // Eliminar fila visual
        rowElement.remove();

        // Recalcular prioridades solo si es tabla OPEN
        const tbody = document.querySelector("#production-table tbody");
        if (tbody.contains(rowElement)) {
            actualizarPrioridades(tbody);
        }

        showToast(window.translations.delete_job_success, true);

    } catch (error) {
        showToast(error || window.translations.delete_job_error, false);
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

            const confirm = await customConfirm(
                window.translations.mark_job_complete_confirm_text, 
                window.translations.mark_job_complete_confirm_title
            );

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
            //showToast(window.translations.job_marked_completed, true);
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
//  PRIORITIES
// ===============================================================
function actualizarPrioridades(tbody) {
    const priorityCells = tbody.querySelectorAll("tr .priority");
    const priorities = window.translations.priorities_array || [];

    priorityCells.forEach((cell, index) => {
        cell.innerText = priorities[index] || `${index + 1}${window.translations.priority_ordinal_suffix || ''}`;
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
                return showToast(data.message || window.translations.load_jobs_error, false);
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

            //showToast(window.translations.jobs_loaded, true);
        })
        .catch(error => showToast(error || window.translations.load_jobs_error, false));
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
                return showToast(data.message || window.translations.load_completed_jobs_error, false);
            }

            const jobs = data.data || [];

            tbodyCompleted.innerHTML = "";

            jobs.forEach(job => {
                const row = crearFilaCompleted(job);
                tbodyCompleted.appendChild(row);
            });

            //showToast(window.translations.completed_jobs_loaded, true);
        })
        .catch(err => showToast(err || window.translations.load_completed_jobs_error, false));
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
                return showToast(data.message || window.translations.update_job_data_error, false);
            }
            //showToast(window.translations.job_data_updated_success, true);
        })
        .catch(error => showToast(error || window.translations.update_job_data_error, false));
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
                return showToast(data.message || window.translations.update_job_priority_error, false);
            }
            //showToast(window.translations.job_priority_updated_success, true);
        })
        .catch(error => showToast(error || window.translations.update_job_priority_error, false));
}

