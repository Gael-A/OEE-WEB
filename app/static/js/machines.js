function applyVisualStateToMachine(machineElement, isChecked) {
  if (!machineElement) return;

  const toggle = machineElement.querySelector('.toggle');
  const leds = {
    on: machineElement.querySelector('.led-on'),
    off: machineElement.querySelector('.led-off')
  };
  const gears = machineElement.querySelectorAll('.rotate, .rotate-offset');

  if (toggle) toggle.checked = isChecked;
  if (leds.on) leds.on.classList.toggle('on', isChecked);
  if (leds.on) leds.on.classList.toggle('off', !isChecked);
  if (leds.off) leds.off.classList.toggle('on', !isChecked);
  if (leds.off) leds.off.classList.toggle('off', isChecked);
  if (gears) {
    gears.forEach(gear => {
      gear.style.animationPlayState = isChecked ? 'running' : 'paused';
    });
  }
}

window.updateMachineView = async function (formData) {
  const { pan, shift, date } = formData;
  if (!pan || !shift || !date) return;

  try {
    const url = `/machines-initial-status-view?date=${date}&shift=${shift}&pan=${pan}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());

    const states = await res.json();
    for (const machineId in states) {
      applyVisualStateToMachine(document.getElementById(machineId), states[machineId]);
    }
  } catch (err) {
    console.error(window.translations.machines_fetch_update_error, err, res ? await res.text() : '');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  waitForElements(['#shift', '#date', '#pan', '#mode-toggle'], initMachineStatus);
});

function waitForElements(selectors, callback, timeout = 5000) {
  const startTime = Date.now();

  const interval = setInterval(() => {
    const missing = selectors.filter(sel => !document.querySelector(sel));
    if (missing.length === 0) {
      clearInterval(interval);
      callback();
    } else if (Date.now() - startTime > timeout) {
      clearInterval(interval);
      console.error(window.translations.machines_wait_elements_timeout, missing);
    }
  }, 100);
}

async function initMachineStatus() {
  const machines = window.machines || [];
  if (machines.length === 0) return;

  const selectedShift = document.getElementById('shift')?.value || '';
  const selectedDate = document.getElementById('date')?.value;
  const panId = document.getElementById('pan')?.value;

  if (!selectedShift || !selectedDate || !panId) {
    console.warn(window.translations.machines_wait_init_data);

    const maxWait = 5000;
    const interval = 100;
    const start = Date.now();

    const checker = setInterval(() => {
      const shift = document.getElementById('shift')?.value;
      const date = document.getElementById('date')?.value;
      const pan = document.getElementById('pan')?.value;

      if (shift && date && pan) {
        clearInterval(checker);
        initMachineStatus();
      } else if (Date.now() - start > maxWait) {
        clearInterval(checker);
        alert(window.translations.machines_alert_missing_data);
      }
    }, interval);

    return;
  }


  let initialStates = {};
  try {
    const isInteractive = document.querySelector('script[data-interactive]')?.getAttribute('data-interactive') === 'true';
    const endpoint = isInteractive ? '/machines-initial-status' : '/machines-initial-status-view';
    const url = `${endpoint}?date=${selectedDate}&shift=${selectedShift}&pan=${panId}`;
    const res = await fetch(url);
    if (res.ok) {
      initialStates = await res.json();
    } else {
      console.error(window.translations.machines_get_init_state_error, await res.text());
    }
  } catch (err) {
    console.error(window.translations.machines_fetch_init_status_error, err);
  }

  initMachineUI(machines, initialStates);
}

function initMachineUI(machines, initialStates = {}) {
  const actionsContainer = document.querySelector('.machine-actions-container');
  const applyBtn = document.getElementById('apply-changes-button');
  const cancelBtn = document.getElementById('cancel-changes-button');

  const savedStates = {};

  machines.forEach(machineId => {
    const machineElement = document.getElementById(machineId);
    if (!machineElement) return;

    const isInteractive = document.querySelector('script[data-interactive]')?.getAttribute('data-interactive') === 'true';

    const label = machineElement.getAttribute('data-label') || window.translations.machines_label;
    const initialChecked = initialStates[machineId] ?? true;

    machineElement.innerHTML = `
      <div class="node">${label}</div>
      <div class="inner">
        <div class="hidden-gears">
          <img src="static/svg/decorativeve-gear-back.svg" class="gear-icon back fourth rotate reverse" alt="">
          <img src="static/svg/decorativeve-gear-back.svg" class="gear-icon back fifth rotate-offset" alt="">
          <img src="static/svg/decorativeve-gear.svg" class="gear-icon first rotate" alt="">
          <img src="static/svg/decorativeve-gear.svg" class="gear-icon second rotate reverse" alt="">
          <img src="static/svg/decorativeve-gear.svg" class="gear-icon thirtd rotate" alt="">
        </div>
        <div class="cover">
          <div class="screw-hole top-left"></div>
          <div class="screw-hole top-right"></div>
          <div class="screw-hole bottom-left"></div>
          <div class="screw-hole bottom-right"></div>
        </div>
      </div>
      <div class="toggle-container">
      <div class="led-labels"><span>${window.translations.machines_toggle_off}</span><span>${window.translations.machines_toggle_on}</span></div>
      <div class="leds">
      <div class="led red led-off"></div>
      <div class="led green led-on"></div>
      </div>
      <input type="checkbox" class="toggle${!isInteractive ? ' hidden' : ''}" id="${machineId}-toggle">
      </div>
      `;

    applyVisualStateToMachine(machineElement, initialChecked);
    savedStates[machineId] = initialChecked;

    if (isInteractive) {
      const toggle = machineElement.querySelector('.toggle');
      toggle.addEventListener('change', () => {
        applyVisualStateToMachine(machineElement, toggle.checked);
        checkForUnsavedChanges();
      });
    }
  });

  function getCurrentStates() {
    const states = {};
    machines.forEach(id => {
      const el = document.getElementById(id);
      const toggle = el?.querySelector('.toggle');
      states[id] = toggle?.checked ?? false;
    });
    return states;
  }

  function checkForUnsavedChanges() {
    const current = getCurrentStates();
    let changed = false;
    for (let id of machines) {
      if (current[id] !== savedStates[id]) {
        changed = true;
        break;
      }
    }

    if (changed) {
      actionsContainer.classList.remove('hidden');
    } else {
      actionsContainer.classList.add('hidden');
    }
  }

  applyBtn?.addEventListener('click', async () => {
    const current = getCurrentStates();
    const selectedShift = document.getElementById('shift')?.value || '';
    const selectedDate = document.getElementById('date')?.value;

    if (!selectedDate) {
      alert(window.translations.machines_alert_select_date);
      return;
    }

    const entriesToSend = [];

    for (const machineId of machines) {
      const currentState = current[machineId];
      const previousState = savedStates[machineId];

      if (currentState !== previousState) {
        entriesToSend.push({
          machine_id: machineId,
          is_on: currentState,
          shift: selectedShift
        });
      }
    }

    if (entriesToSend.length === 0) {
      if (window.showToast) showToast(window.translations.machines_no_changes_to_save, false);
      return;
    }

    const confirmTitle = window.translations.machines_confirm_change_title || 'Confirmar Cambios';
    const confirmBody = window.translations.machines_confirm_change_body || '¿Estás seguro de que deseas aplicar estos cambios?';

    const confirmed = await customConfirm(confirmBody, confirmTitle);

    if (!confirmed) {
      if (window.showToast) showToast(window.translations.machines_operation_cancelled, false);
      return;
    }

    try {
      const res = await fetch("/machines-working", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          selected_date: selectedDate,
          entries: entriesToSend
        })
      });

      const result = await res.json();

      if (res.ok) {
        Object.assign(savedStates, current);
        if (window.showToast) showToast(window.translations.machines_changes_saved_successfully, true);
      } else {
        alert(`${window.translations.machines_error_saving} ${result.error}`);
      }

      checkForUnsavedChanges();

    } catch (err) {
      alert(`${window.translations.machines_error_saving} ${err.message}`);
    }
  });

  cancelBtn?.addEventListener('click', () => {
    machines.forEach(id => {
      const machineElement = document.getElementById(id);
      if (machineElement)
        applyVisualStateToMachine(machineElement, savedStates[id]);
    });

    checkForUnsavedChanges();
  });

  checkForUnsavedChanges();
}
