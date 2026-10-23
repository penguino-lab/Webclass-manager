// Local, reusable crop UI. The caller owns the bitmap and encoding/storage.
(() => {
  if (globalThis.WebClassBannerCrop) return;
  const id = 'wcl-banner-crop', styleId = `${id}-style`;
  let dismissActive = null;
  function installStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style'); style.id = styleId;
    style.textContent = `
#${id}{all:initial!important;box-sizing:border-box!important;position:fixed!important;inset:12px!important;margin:auto!important;width:min(960px,calc(100vw - 24px))!important;height:fit-content!important;max-height:calc(100dvh - 24px)!important;overflow:auto!important;overscroll-behavior:contain!important;padding:20px!important;border:1px solid #bac6d2!important;border-radius:12px!important;background:#fff!important;color:#233447!important;box-shadow:0 20px 70px #0007!important;font:16px/1.5 system-ui,sans-serif!important;isolation:isolate!important;text-align:left!important}
#${id}:not([open]){display:none!important}
#${id}[open]{display:block!important}
#${id}::backdrop{background:#142133b3!important}
#${id} *{box-sizing:border-box!important;font-family:system-ui,sans-serif!important}
#${id} h2{display:block!important;margin:0 0 8px!important;padding:0!important;color:#233447!important;font-size:20px!important;line-height:1.4!important;font-weight:700!important}
#${id} .wcl-banner-crop-help{display:block!important;margin:0 0 14px!important;color:#43566b!important;font-size:14px!important;line-height:1.6!important}
#${id} .wcl-banner-crop-stage{display:block!important;position:relative!important;width:100%!important;height:clamp(180px,38dvh,340px)!important;min-height:160px!important;margin:0!important;padding:0!important;overflow:hidden!important;border:1px solid #66788c!important;border-radius:6px!important;background:#192432!important;touch-action:none!important;cursor:grab!important}
#${id} .wcl-banner-crop-stage[data-dragging]{cursor:grabbing!important}
#${id} canvas{display:block!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;pointer-events:none!important}
#${id} .wcl-banner-crop-zoom-row{display:grid!important;grid-template-columns:auto minmax(60px,1fr) 58px!important;align-items:center!important;gap:12px!important;margin:16px 0!important;color:#233447!important}
#${id} label,#${id} output{margin:0!important;padding:0!important;color:#233447!important;font-size:14px!important;line-height:1.5!important;font-weight:500!important}
#${id} output{text-align:right!important}
#${id} .wcl-banner-crop-zoom{display:block!important;position:static!important;appearance:auto!important;width:100%!important;min-width:0!important;height:32px!important;min-height:32px!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;accent-color:#225c90!important;cursor:pointer!important}
#${id} .wcl-banner-crop-actions{display:flex!important;flex-wrap:wrap!important;justify-content:flex-end!important;align-items:center!important;gap:10px!important;margin:12px 0 0!important}
#${id} button{display:inline-flex!important;position:static!important;align-items:center!important;justify-content:center!important;float:none!important;width:auto!important;min-width:112px!important;max-width:100%!important;min-height:44px!important;height:auto!important;margin:0!important;padding:10px 18px!important;border:1px solid #aab9c8!important;border-radius:6px!important;background:#edf1f5!important;background-image:none!important;color:#233447!important;box-shadow:none!important;text-shadow:none!important;font:600 16px/1.4 system-ui,sans-serif!important;cursor:pointer!important}
#${id} button:hover{background:#dfe7ef!important}
#${id} .wcl-banner-crop-reset{margin-right:auto!important}
#${id} .wcl-banner-crop-apply{background:#225c90!important;border-color:#19466f!important;color:#fff!important}
#${id} .wcl-banner-crop-apply:hover{background:#19466f!important}
#${id} button:focus-visible,#${id} .wcl-banner-crop-stage:focus-visible,#${id} .wcl-banner-crop-zoom:focus-visible{outline:3px solid #1680cf!important;outline-offset:3px!important}
#${id} .wcl-banner-crop-status{display:block!important;min-height:0!important;margin:8px 0 0!important;color:#9c3333!important;font-size:14px!important;line-height:1.5!important}
@media(max-width:480px){#${id}{padding:14px!important}#${id} .wcl-banner-crop-reset{width:100%!important;margin-right:0!important}#${id} .wcl-banner-crop-actions>button:not(.wcl-banner-crop-reset){flex:1 1 auto!important;min-width:0!important}}
`;
    (document.head || document.documentElement).append(style);
  }
  // Integer canvas dimensions cannot represent every real-valued ratio. Choose
  // the closest rational pair, scaling exact pairs up within the source pixels.
  function outputSize(width, height, ratio) {
    const scale = Math.min(1, 2560 / width, 4096 / height);
    const maxW = Math.max(1, Math.floor(width * scale));
    const maxH = Math.max(1, Math.floor(height * scale));
    let best = { width:maxW, height:maxH }, error = Infinity;
    for (let h = 1; h <= maxH; h++) {
      const w = Math.round(h * ratio);
      if (w < 1 || w > maxW) continue;
      const difference = Math.abs(w / h - ratio);
      if (difference < error - 1e-12 || Math.abs(difference - error) <= 1e-12 && w * h > best.width * best.height) {
        best = { width:w, height:h }; error = difference;
      }
    }
    // A sub-pixel crop may need minimal upscaling to represent even one row.
    if (!Number.isFinite(error)) return ratio >= 1
      ? { width:Math.max(1,Math.min(2560,Math.round(ratio))), height:1 }
      : { width:1, height:Math.max(1,Math.min(4096,Math.round(1 / ratio))) };
    const multiplier = Math.max(1, Math.min(Math.floor(maxW / best.width), Math.floor(maxH / best.height)));
    return { width:best.width * multiplier, height:best.height * multiplier };
  }
  function open(bitmap, { aspectRatio = 6 } = {}) {
    dismissActive?.();
    const imageW = Number(bitmap?.width), imageH = Number(bitmap?.height);
    if (!Number.isFinite(imageW) || !Number.isFinite(imageH) || imageW <= 0 || imageH <= 0) return Promise.resolve(null);
    const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 6;
    installStyle();
    return new Promise(resolve => {
      const previousFocus = document.activeElement;
      const controller = new AbortController(), { signal } = controller;
      const dialog = document.createElement('dialog'); dialog.id = id;
      dialog.setAttribute('aria-labelledby', `${id}-title`);
      dialog.setAttribute('aria-describedby', `${id}-help`);
      const title = document.createElement('h2'); title.id = `${id}-title`; title.textContent = 'バナー画像を切り取る';
      const help = document.createElement('p'); help.id = `${id}-help`; help.className = `${id}-help`;
      help.textContent = '明るい枠がバナーに表示される範囲です。画像をドラッグして位置を調整し、拡大率でズームできます。枠を選択して矢印キーでも移動できます（Shiftで大きく移動）。';
      const stage = document.createElement('div'); stage.className = `${id}-stage`; stage.tabIndex = 0;
      stage.setAttribute('role','group'); stage.setAttribute('aria-label','画像の位置を調整'); stage.setAttribute('aria-describedby',help.id);
      const preview = document.createElement('canvas'); preview.setAttribute('aria-hidden','true'); stage.append(preview);
      const row = document.createElement('div'); row.className = `${id}-zoom-row`;
      const label = document.createElement('label'); label.htmlFor = `${id}-zoom`; label.textContent = '拡大率';
      const zoom = document.createElement('input'); zoom.type = 'range'; zoom.id = `${id}-zoom`; zoom.className = `${id}-zoom`;
      zoom.min = '1'; zoom.max = '8'; zoom.step = '.01'; zoom.value = '1'; zoom.setAttribute('aria-valuetext','100%');
      const percentage = document.createElement('output'); percentage.htmlFor = zoom.id; percentage.textContent = '100%';
      row.append(label,zoom,percentage);
      const actions = document.createElement('div'); actions.className = `${id}-actions`;
      const button = (name,text) => { const element = document.createElement('button'); element.type = 'button'; element.className = `${id}-${name}`; element.textContent = text; return element; };
      const reset = button('reset','位置をリセット'), cancel = button('cancel','キャンセル'), apply = button('apply','この範囲を使用');
      actions.append(reset,cancel,apply);
      const status = document.createElement('p'); status.className = `${id}-status`; status.setAttribute('role','status');
      dialog.append(title,help,stage,row,actions,status);
      const baseW = Math.min(imageW, imageH * ratio), baseH = baseW / ratio;
      let centerX = imageW / 2, centerY = imageH / 2, factor = 1;
      let viewW = 0, viewH = 0, fit = 1, drag = null, frame = 0, done = false;
      let resizeObserver;
      function crop() { return { width:baseW / factor, height:baseH / factor }; }
      function clamp() {
        const { width,height } = crop();
        centerX = Math.max(width / 2, Math.min(imageW - width / 2, centerX));
        centerY = Math.max(height / 2, Math.min(imageH - height / 2, centerY));
      }
      function release(event) {
        if (event?.pointerId !== undefined && drag && event.pointerId !== drag.id) return;
        const held = drag; drag = null; stage.removeAttribute('data-dragging');
        if (held && stage.hasPointerCapture(held.id)) stage.releasePointerCapture(held.id);
      }
      function finish(result) {
        if (done) return; done = true;
        release(); controller.abort(); resizeObserver?.disconnect(); cancelAnimationFrame(frame);
        if (dismissActive === dismiss) dismissActive = null;
        if (dialog.open) dialog.close(); dialog.remove();
        let focusTarget = previousFocus;
        if (!focusTarget?.isConnected || !focusTarget.getClientRects().length) {
          const owners = [...document.querySelectorAll('[aria-controls]')];
          for (let node = previousFocus; node; node = node.parentElement) {
            const owner = node.id && owners.find(element => element.getAttribute('aria-controls').split(/\s+/).includes(node.id) && element.getClientRects().length);
            if (owner) { focusTarget = owner; break; }
          }
        }
        if (focusTarget?.isConnected && typeof focusTarget.focus === 'function') focusTarget.focus({preventScroll:true});
        resolve(result);
      }
      const dismiss = () => finish(null);
      dismissActive = dismiss;
      function draw() {
        frame = 0; if (done || !viewW || !viewH) return;
        const context = preview.getContext('2d');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        context.setTransform(dpr,0,0,dpr,0,0); context.clearRect(0,0,viewW,viewH);
        const scale = fit * factor;
        try { context.drawImage(bitmap, viewW / 2 - centerX * scale, viewH / 2 - centerY * scale, imageW * scale, imageH * scale); }
        catch { status.textContent = '画像を表示できません。キャンセルして画像を選び直してください。'; return; }
        const width = baseW * fit, height = baseH * fit, left = (viewW - width) / 2, top = (viewH - height) / 2;
        context.beginPath(); context.rect(0,0,viewW,viewH); context.rect(left,top,width,height);
        context.fillStyle = '#000a'; context.fill('evenodd');
        context.strokeStyle = '#fff'; context.lineWidth = 3; context.strokeRect(left,top,width,height);
        context.strokeStyle = '#1680cf'; context.lineWidth = 1; context.strokeRect(left,top,width,height);
      }
      function paint() { if (!frame && !done) frame = requestAnimationFrame(draw); }
      function resize() {
        if (done) return;
        const bounds = stage.getBoundingClientRect();
        viewW = stage.clientWidth; viewH = stage.clientHeight;
        if (!bounds.width || !viewW || !viewH) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        preview.width = Math.max(1, Math.round(viewW * dpr)); preview.height = Math.max(1, Math.round(viewH * dpr));
        // Let the banner window fill the stage width even for tall portraits.
        // Surrounding source pixels remain visible where they fit outside it.
        fit = Math.min(Math.max(1, viewW - 24) / baseW, Math.max(1, viewH - 24) / baseH);
        release(); paint();
      }
      stage.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0 || drag) return;
        event.preventDefault(); stage.focus({preventScroll:true});
        drag = { id:event.pointerId, x:event.clientX, y:event.clientY, centerX,centerY };
        stage.setPointerCapture(event.pointerId); stage.setAttribute('data-dragging','');
      }, {signal});
      stage.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        event.preventDefault();
        centerX = drag.centerX - (event.clientX - drag.x) / (fit * factor);
        centerY = drag.centerY - (event.clientY - drag.y) / (fit * factor);
        clamp(); paint();
      }, {signal});
      for (const type of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(type,release,{signal});
      stage.addEventListener('keydown', event => {
        const directions = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
        const direction = directions[event.key]; if (!direction) return;
        event.preventDefault();
        const step = (event.shiftKey ? 20 : 4) / (fit * factor);
        centerX -= direction[0] * step; centerY -= direction[1] * step; clamp(); paint();
      }, {signal});
      zoom.addEventListener('input', () => {
        release(); factor = Math.max(1, Math.min(8, Number(zoom.value) || 1));
        percentage.textContent = `${Math.round(factor * 100)}%`; zoom.setAttribute('aria-valuetext',percentage.textContent); clamp(); paint();
      }, {signal});
      reset.addEventListener('click', () => {
        release(); centerX = imageW / 2; centerY = imageH / 2; factor = 1;
        zoom.value = '1'; percentage.textContent = '100%'; zoom.setAttribute('aria-valuetext','100%'); status.textContent = ''; paint(); stage.focus();
      }, {signal});
      cancel.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); dismiss(); }, {signal});
      apply.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        clamp(); const {width,height} = crop(), size = outputSize(width,height,ratio);
        const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
        try {
          const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high';
          context.drawImage(bitmap,centerX - width / 2,centerY - height / 2,width,height,0,0,canvas.width,canvas.height);
          finish(canvas);
        } catch { status.textContent = '切り取りに失敗しました。キャンセルして画像を選び直してください。'; }
      }, {signal});
      dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); }, {signal});
      dialog.addEventListener('close',dismiss,{signal});
      // Keep native host form/navigation shortcuts from seeing dialog actions;
      // Tab and Escape retain the browser's native modal focus behavior.
      for (const type of ['click','pointerdown','pointermove','pointerup','keydown','keyup','input','change','focusin','focusout','submit']) {
        dialog.addEventListener(type, event => { event.stopPropagation(); if (type === 'submit') event.preventDefault(); }, {signal});
      }
      window.addEventListener('resize',resize,{signal});
      document.body ? document.body.append(dialog) : document.documentElement.append(dialog);
      try {
        dialog.showModal();
        resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage);
        resize(); stage.focus({preventScroll:true});
      } catch { finish(null); }
    });
  }
  globalThis.WebClassBannerCrop = Object.freeze({open});
})();
