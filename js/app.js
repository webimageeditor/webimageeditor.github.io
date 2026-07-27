import { setupContextMenu } from './contextMenu.js';

const MAX_TOASTS = 3;
const toasts = [];

window.alert = function (message) {
    if (toasts.length >= MAX_TOASTS) {
        const oldToast = toasts.shift();
        oldToast.hideToast();
    }

    const toast = Toastify({
        text: message,
        duration: 3000,
        close: true,
        gravity: "top",
        position: "center",
        stopOnFocus: true,
        className: "toast",
        callback: () => {
            const index = toasts.indexOf(toast);
            if (index !== -1) {
                toasts.splice(index, 1);
            }
        }
    });

    toasts.push(toast);
    toast.showToast();
};
const originalFetch = window.fetch.bind(window);

window.fetch = async function (resource, options) {
    const input = resource instanceof Request ? resource.url : String(resource);

    try {
        if (
            input.startsWith("blob:") ||
            input.startsWith("data:")
        ) {
            return originalFetch(resource, options);
        }

        const url = new URL(input, location.href);

        if (url.origin === location.origin) {
            return originalFetch(resource, options);
        }

        throw new Error(`Fetch bloqueado: ${url.href}`);
    } catch (err) {
        return Promise.reject(err);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const btnOpen = document.getElementById('btn-open');
    const btnExport = document.getElementById('btn-export');
    const dropZone = document.getElementById('drop-zone');
    const welcomeMsg = document.getElementById('welcome-msg');
    const canvasWrapper = document.querySelector('.canvas-wrapper');
    const canvas = document.getElementById('main-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageBox = document.getElementById("image-box");

    const statusInfo = document.getElementById('status-info');
    const resolutionInfo = document.getElementById('resolution-info');

    const resizeModal = document.getElementById("resize-modal");
    const resizeWidth = document.getElementById("resize-width");
    const resizeHeight = document.getElementById("resize-height");
    const keepRatio = document.getElementById("keep-ratio");
    const propertiesPanel = document.querySelector('.properties-panel');

    const zoomScrubber = document.querySelector('.zoom-scrubber');
    const zoomVal = document.getElementById('zoom-val');
    const zoomToast = document.getElementById('zoom-toast');

    const qualityContainer = document.getElementById('quality-container');

    const sidebarResizer = document.getElementById('sidebar-resizer');
    const btnToolMove = document.getElementById('btn-tool-move');
    const btnToolCrop = document.getElementById('btn-tool-crop');
    const cropBox = document.getElementById('crop-box');
    const btnApplyCrop = document.getElementById('btn-apply-crop');
    const btnUpscale = document.getElementById('btn-upscale');

    const upscaler = new Upscaler({
        model: {
            path: "/models/upscaler/default-model/model.json",
            scale: 2,
            inputRange: [0, 1],
            outputRange: [0, 255],
        },
    });

    btnUpscale.addEventListener('click', async () => {
        if (!currentImage) {
            alert('Open image first.');
            return;
        }

        btnUpscale.disabled = true;
        btnUpscale.textContent = '⏳ Processing upscale...';
        statusInfo.textContent = 'Applying upscale. Please wait...';

        try {
            const dataURL = canvas.toDataURL('image/png');

            await new Promise(resolve => setTimeout(resolve, 50));

            const upscaledImgSrc = await upscaler.upscale(dataURL, {
                patchSize: 64,
                padding: 4,
                progress: (percent) => {
                    const percentage = Math.round(percent * 100);
                    statusInfo.textContent = `⏳ Upscaling... ${percentage}%`;
                    btnUpscale.textContent = `⏳ ${percentage}%`;
                }
            });

            const newImg = new Image();
            newImg.onload = () => {
                currentImage = newImg;

                displayWidth = newImg.width;
                displayHeight = newImg.height;

                resetTransforms();
                applyAll();

                try {
                    localStorage.setItem('savedImage', upscaledImgSrc);
                } catch (e) {
                    console.warn('Maybe image too heavy for localStorage.');
                }

                statusInfo.textContent = '✅ Upscaling successfully completed!';
                btnUpscale.disabled = false;
                btnUpscale.textContent = '🚀 Upscale Image (2x)';
            };
            newImg.src = upscaledImgSrc;

        } catch (error) {
            console.error('Error durante el upscaling:', error);
            statusInfo.textContent = '❌ Image too big for your GPU.';
            btnUpscale.disabled = false;
            btnUpscale.textContent = '🚀 Upscale Image (2x)';
        }
    });

    let currentTool = 'move';
    let isDrawingCrop = false;
    let cropStartX = 0, cropStartY = 0;
    let cropRect = { x: 0, y: 0, w: 0, h: 0 };
    let currentMimeType;

    btnToolMove.addEventListener('click', () => {
        currentTool = 'move';
        btnToolMove.classList.add('active');
        btnToolCrop.classList.remove('active');
        cropBox.style.display = 'none';
        document.body.style.cursor = 'default';
        document.querySelectorAll('.handle').forEach(handle => {
            handle.style.display = 'block';
        });
    });

    btnToolCrop.addEventListener('click', () => {
        if (!currentImage) return;
        currentTool = 'crop';
        btnToolCrop.classList.add('active');
        btnToolMove.classList.remove('active');
        document.body.style.cursor = 'crosshair';
        cropBox.style.display = 'none';
        document.querySelectorAll('.handle').forEach(handle => {
            handle.style.display = 'none';
        });
    });

    let isResizingSidebar = false;

    let currentZoom = 100;
    let isScrubbing = false;
    let startXScrub = 0;
    let startZoomScrub = 0;
    let toastTimeout;

    let originalRatio = 1;

    let currentImage = null;
    let currentFileName = '';
    let resizing = false;
    let currentHandle = null;

    let startX;
    let startY;

    let startWidth;
    let startHeight;

    let displayWidth;
    let displayHeight;

    let transform = {
        rotate: 0,
        flipH: 1,
        flipV: 1
    };

    function updateZoomUI(val) {
        currentZoom = Math.max(10, Math.min(500, val));
        let scale = currentZoom / 100;

        zoomVal.textContent = `${Math.round(currentZoom)}%`;
        zoomToast.textContent = `${Math.round(currentZoom)}%`;

        canvasWrapper.style.transform = `scale(${scale})`;

        zoomToast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            zoomToast.classList.remove('show');
        }, 800);
    }

    imageBox.addEventListener('mousedown', (e) => {
        if (currentTool === 'crop' && e.target !== btnApplyCrop) {
            e.preventDefault();
            isDrawingCrop = true;

            const rect = imageBox.getBoundingClientRect();
            const scale = currentZoom / 100;

            cropStartX = (e.clientX - rect.left) / scale;
            cropStartY = (e.clientY - rect.top) / scale;

            cropRect = { x: cropStartX, y: cropStartY, w: 0, h: 0 };

            cropBox.style.left = `${cropStartX}px`;
            cropBox.style.top = `${cropStartY}px`;
            cropBox.style.width = '0px';
            cropBox.style.height = '0px';
            cropBox.style.display = 'block';
        }
    });

    sidebarResizer.addEventListener('mousedown', (e) => {
        isResizingSidebar = true;
        sidebarResizer.classList.add('active');
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
    });

    zoomScrubber.addEventListener('mousedown', (e) => {
        isScrubbing = true;
        startXScrub = e.clientX;
        startZoomScrub = currentZoom;
        document.body.style.cursor = 'ew-resize';
    });

    zoomScrubber.addEventListener('dblclick', () => {
        updateZoomUI(100);
    });

    const filters = {
        brightness: document.getElementById('brightness'),
        contrast: document.getElementById('contrast'),
        saturation: document.getElementById('saturation'),
        blur: document.getElementById('blur'),
        invert: document.getElementById('invert')
    };

    imageBox.style.width = canvas.width + "px";
    imageBox.style.height = canvas.height + "px";

    document.getElementById("resize-cancel").addEventListener("click", () => {
        resizeModal.classList.remove("show");
    });

    document.getElementById("resize-apply").addEventListener("click", () => {
        displayWidth = parseInt(resizeWidth.value);
        displayHeight = parseInt(resizeHeight.value);

        applyAll();

        resizeModal.classList.remove("show");
    });

    resolutionInfo.addEventListener("click", () => {
        if (!currentImage) return;

        resizeWidth.value = displayWidth;
        resizeHeight.value = displayHeight;

        originalRatio = displayWidth / displayHeight;

        resizeModal.classList.add("show");
    });

    resizeWidth.addEventListener("input", () => {

        if (!keepRatio.checked) return;

        resizeHeight.value = Math.round(resizeWidth.value / originalRatio);

    });

    resizeHeight.addEventListener("input", () => {

        if (!keepRatio.checked) return;

        resizeWidth.value = Math.round(resizeHeight.value * originalRatio);

    });

    btnOpen.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadImage(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            if (e.dataTransfer.files.length > 1) {
                handleBatchFiles(e.dataTransfer.files);
            } else {
                loadImage(e.dataTransfer.files[0]);
            }
        }
    });

    window.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                loadImage(blob, 'portapapeles.png');
                break;
            }
        }
    });

    function loadImage(file, forceName = null) {
        if (!file.type.match('image.*')) {
            alert('Archive format isnt supported.');
            return;
        }

        currentMimeType = file.type

        currentFileName = forceName || file.name;
        const reader = new FileReader();

        reader.onload = (event) => {
            const dataURL = event.target.result;

            try {
                localStorage.setItem('savedImage', dataURL);
                localStorage.setItem('savedFileName', currentFileName);
                localStorage.setItem('savedMimeType', currentMimeType);
            } catch (e) {
                console.warn('Image is too big for saving it on localStorage.');
            }

            const img = new Image();
            img.onload = () => {
                currentImage = img;
                displayWidth = img.width;
                displayHeight = img.height;
                resetTransforms();

                const savedSettings = localStorage.getItem('editorSettings');
                if (savedSettings) {
                    try {
                        const settings = JSON.parse(savedSettings);
                        displayWidth = settings.displayWidth;
                        displayHeight = settings.displayHeight;
                        transform = settings.transform;

                        filters.brightness.value = settings.filters.brightness;
                        document.getElementById('val-brightness').textContent = settings.filters.brightness + '%';

                        filters.contrast.value = settings.filters.contrast;
                        document.getElementById('val-contrast').textContent = settings.filters.contrast + '%';

                        filters.saturation.value = settings.filters.saturation;
                        document.getElementById('val-saturation').textContent = settings.filters.saturation + '%';

                        filters.blur.value = settings.filters.blur;
                        document.getElementById('val-blur').textContent = settings.filters.blur + 'px';

                        filters.invert.value = settings.filters.invert;
                        document.getElementById('val-invert').textContent = settings.filters.invert + '%';
                    } catch (e) {
                        displayWidth = img.width;
                        displayHeight = img.height;
                        resetTransforms();
                    }
                } else {
                    displayWidth = img.width;
                    displayHeight = img.height;
                    resetTransforms();
                }

                document.getElementById('btn-reset').click();

                welcomeMsg.style.display = 'none';
                canvasWrapper.style.display = 'inline-flex';
                imageBox.style.display = 'inline-block';
                imageBox.style.width = canvas.width + "px";
                imageBox.style.height = canvas.height + "px";

                propertiesPanel.style.display = 'block';
                sidebarResizer.style.display = 'block';
                zoomScrubber.style.display = 'flex';

                statusInfo.textContent = `Loaded file: ${currentFileName}`;
            };
            img.src = dataURL;
        };
        reader.readAsDataURL(file);
    }

    document.querySelectorAll(".handle").forEach(handle => {
        handle.addEventListener("mousedown", e => {
            if (currentTool === 'crop') return;

            e.preventDefault();
            resizing = true;
            currentHandle = handle.classList[1];

            startX = e.clientX;
            startY = e.clientY;

            startWidth = imageBox.offsetWidth;
            startHeight = imageBox.offsetHeight;
        });
    });

    document.addEventListener("mousemove", (e) => {
        if (isResizingSidebar) {
            let newWidth = window.innerWidth - e.clientX;

            if (newWidth < 120) {
                newWidth = 0;
                propertiesPanel.style.padding = '20px 0';
            } else {
                propertiesPanel.style.padding = '20px';
            }

            if (newWidth > window.innerWidth - 200) {
                newWidth = window.innerWidth - 200;
            }

            propertiesPanel.style.width = `${newWidth}px`;
        }

        if (isScrubbing) {
            const deltaX = e.clientX - startXScrub;
            updateZoomUI(startZoomScrub + deltaX);
        }

        if (resizing) {
            let w = startWidth;
            let h = startHeight;

            if (currentHandle.includes("e"))
                w += e.clientX - startX;

            if (currentHandle.includes("s"))
                h += e.clientY - startY;

            if (currentHandle.includes("w"))
                w -= e.clientX - startX;

            if (currentHandle.includes("n"))
                h -= e.clientY - startY;

            displayWidth = Math.max(10, w);
            displayHeight = Math.max(10, h);

            applyAll();
        }

        if (isDrawingCrop) {
            const rect = imageBox.getBoundingClientRect();
            const scale = currentZoom / 100;
            const currentX = (e.clientX - rect.left) / scale;
            const currentY = (e.clientY - rect.top) / scale;

            cropRect.w = Math.abs(currentX - cropStartX);
            cropRect.h = Math.abs(currentY - cropStartY);
            cropRect.x = Math.min(currentX, cropStartX);
            cropRect.y = Math.min(currentY, cropStartY);

            cropRect.x = Math.max(0, cropRect.x);
            cropRect.y = Math.max(0, cropRect.y);
            if (cropRect.x + cropRect.w > canvas.width) cropRect.w = canvas.width - cropRect.x;
            if (cropRect.y + cropRect.h > canvas.height) cropRect.h = canvas.height - cropRect.y;

            cropBox.style.left = `${cropRect.x}px`;
            cropBox.style.top = `${cropRect.y}px`;
            cropBox.style.width = `${cropRect.w}px`;
            cropBox.style.height = `${cropRect.h}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizingSidebar) {
            isResizingSidebar = false;
            sidebarResizer.classList.remove('active');
        }

        if (isScrubbing) {
            isScrubbing = false;
        }

        if (resizing) {
            resizing = false;
        }

        if (isDrawingCrop) {
            isDrawingCrop = false;
            if (cropRect.w < 10 || cropRect.h < 10) {
                cropBox.style.display = 'none';
            }
        }

        document.body.style.cursor = 'default';
    });

    function resetTransforms() {
        transform.rotate = 0;
        transform.flipH = 1;
        transform.flipV = 1;
    }

    function applyAll() {
        if (!currentImage) return;

        const isRotated = transform.rotate === 90 || transform.rotate === 270;

        const w = Math.round(displayWidth);
        const h = Math.round(displayHeight);

        canvas.width = isRotated ? h : w;
        canvas.height = isRotated ? w : h;

        resolutionInfo.textContent = `${Math.round(displayWidth)} x ${Math.round(displayHeight)} px`;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(transform.rotate * Math.PI / 180);
        ctx.scale(transform.flipH, transform.flipV);

        ctx.filter = `
            brightness(${filters.brightness.value}%)
            contrast(${filters.contrast.value}%)
            saturate(${filters.saturation.value}%)
            blur(${filters.blur.value}px)
            invert(${filters.invert.value}%)
        `;

        const blurValue = parseFloat(filters.blur.value);
        const margin = blurValue > 0 ? blurValue * 2 : 0;

        ctx.drawImage(
            currentImage,
            (-w / 2) - margin,
            (-h / 2) - margin,
            w + (margin * 2),
            h + (margin * 2)
        );

        ctx.restore();
        imageBox.style.width = canvas.width + "px";
        imageBox.style.height = canvas.height + "px";
        const editorSettings = {
            displayWidth,
            displayHeight,
            transform,
            filters: {
                brightness: filters.brightness.value,
                contrast: filters.contrast.value,
                saturation: filters.saturation.value,
                blur: filters.blur.value,
                invert: filters.invert.value
            }
        };
        localStorage.setItem('editorSettings', JSON.stringify(editorSettings));
    }

    Object.keys(filters).forEach(key => {
        filters[key].addEventListener('input', (e) => {
            document.getElementById(`val-${key}`).textContent =
                key === 'blur' ? `${e.target.value}px` : `${e.target.value}%`;
            requestAnimationFrame(applyAll);
        });
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        filters.brightness.value = 100; document.getElementById('val-brightness').textContent = '100%';
        filters.contrast.value = 100; document.getElementById('val-contrast').textContent = '100%';
        filters.saturation.value = 100; document.getElementById('val-saturation').textContent = '100%';
        filters.blur.value = 0; document.getElementById('val-blur').textContent = '0px';
        filters.invert.value = 0; document.getElementById('val-invert').textContent = '0%';
        applyAll();
    });

    document.getElementById('btn-rotate-l').addEventListener('click', () => {
        transform.rotate = (transform.rotate - 90 + 360) % 360; applyAll();
    });
    document.getElementById('btn-rotate-r').addEventListener('click', () => {
        transform.rotate = (transform.rotate + 90) % 360; applyAll();
    });
    document.getElementById('btn-flip-h').addEventListener('click', () => {
        transform.flipH *= -1; applyAll();
    });
    document.getElementById('btn-flip-v').addEventListener('click', () => {
        transform.flipV *= -1; applyAll();
    });

    const exportFormat = document.getElementById('export-format');

    exportFormat.addEventListener('change', (e) => {
        const format = e.target.value;
        if (format === 'image/jpeg' || format === 'image/webp') {
            qualityContainer.style.display = 'block';
        } else {
            qualityContainer.style.display = 'none';
        }
    });

    const qualitySlider = document.getElementById('quality');

    qualitySlider.addEventListener('input', (e) => {
        document.getElementById('val-quality').textContent = `${e.target.value}%`;
    });

    btnExport.addEventListener('click', () => {
        if (!currentImage) {
            alert('There is no image to export.');
            return;
        }

        const format = exportFormat.value;
        const quality = qualitySlider.value / 100;
        let ext = format.split('/')[1];
        if (ext === 'jpeg') ext = 'jpg';

        let finalCanvas = canvas;
        const baseName = currentFileName.substring(0, currentFileName.lastIndexOf('.')) || currentFileName;

        if (format === 'image/gif') {
            statusInfo.textContent = 'Procesando GIF... 0%';

            const gif = new GIF({
                workers: 2,
                quality: 10,
                width: finalCanvas.width,
                height: finalCanvas.height,
                workerScript: 'libs/gif.worker.js'
            });

            gif.addFrame(finalCanvas, { delay: 200 });

            gif.on('progress', function (p) {
                statusInfo.textContent = `Processing... ${Math.round(p * 100)}%`;
            });

            gif.on('abort', function () {
                statusInfo.textContent = 'Error: The process was aborted ❌';
            });

            gif.on('finished', function (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${baseName}_edited.gif`;
                a.click();
                URL.revokeObjectURL(url);
                statusInfo.textContent = 'Image successfully exported.';
            });

            gif.render();

            return;
        }

        finalCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${baseName}_edited.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
            statusInfo.textContent = 'Image successfully exported.';
        }, format, quality);
    });

    btnApplyCrop.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cropRect.w === 0 || cropRect.h === 0) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropRect.w;
        tempCanvas.height = cropRect.h;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.drawImage(
            canvas,
            cropRect.x, cropRect.y, cropRect.w, cropRect.h,
            0, 0, cropRect.w, cropRect.h
        );

        const newImg = new Image();
        newImg.onload = () => {
            currentImage = newImg;
            displayWidth = newImg.width;
            displayHeight = newImg.height;

            document.getElementById('btn-reset').click();
            resetTransforms();
            applyAll();

            btnToolMove.click();

            try {
                localStorage.setItem('savedImage', tempCanvas.toDataURL(currentMimeType, 0.9));
            } catch (e) {
                console.warn(`Warn: Maybe image too heavy for localStorage`);
                console.error(`Error: ${e}`)
            }
        };

        newImg.src = tempCanvas.toDataURL(currentMimeType, 0.9);
    });

    function restoreImage() {
        const savedImage = localStorage.getItem('savedImage');
        const savedFileName = localStorage.getItem('savedFileName');

        const savedMimeType = localStorage.getItem('savedMimeType');

        if (savedImage) {
            currentFileName = savedFileName || 'recovered_image.png';
            currentMimeType = savedMimeType || 'image/png';

            const img = new Image();

            img.onload = () => {
                currentImage = img;
                displayWidth = img.width;
                displayHeight = img.height;
                resetTransforms();
                applyAll();

                welcomeMsg.style.display = 'none';
                canvasWrapper.style.display = 'inline-flex';
                imageBox.style.display = 'inline-block';
                imageBox.style.width = canvas.width + "px";
                imageBox.style.height = canvas.height + "px";

                propertiesPanel.style.display = 'block';
                sidebarResizer.style.display = 'block';
                zoomScrubber.style.display = 'flex';

                statusInfo.textContent = `Session restored: ${currentFileName}`;
            };
            img.src = savedImage;
        }
    }

    restoreImage();

    const contextMenu = setupContextMenu({
        canvas,
        ctx,
        statusInfo,
        welcomeMsg,
        canvasWrapper,
        imageBox,
        propertiesPanel,
        sidebarResizer,
        zoomVal,
        zoomToast,
        btnToolMove,
        resolutionInfo,
        zoomScrubber,

        resetZoomState: () => { currentZoom = 100; },
        getImage: () => currentImage,
        setImage: (val) => { currentImage = val; },
        setFileName: (val) => { currentFileName = val; }
    });
});