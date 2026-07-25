document.addEventListener('DOMContentLoaded', () => {
    // Referencias del DOM
    const fileInput = document.getElementById('file-input');
    const btnOpen = document.getElementById('btn-open');
    const btnExport = document.getElementById('btn-export');
    const btnBatch = document.getElementById('btn-batch');
    const dropZone = document.getElementById('drop-zone');
    const welcomeMsg = document.getElementById('welcome-msg');
    const canvasWrapper = document.querySelector('.canvas-wrapper');
    const canvas = document.getElementById('main-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // UI Info
    const statusInfo = document.getElementById('status-info');
    const resolutionInfo = document.getElementById('resolution-info');

    // Estado global de la aplicación
    let currentImage = null; // Guardará la imagen original
    let currentFileName = '';
    
    // Parámetros de transformación
    let transform = {
        rotate: 0, // grados
        flipH: 1,  // 1 o -1
        flipV: 1
    };

    // Objeto con filtros
    const filters = {
        brightness: document.getElementById('brightness'),
        contrast: document.getElementById('contrast'),
        saturation: document.getElementById('saturation'),
        blur: document.getElementById('blur'),
        invert: document.getElementById('invert')
    };

    // ==========================================
    // SISTEMA DE CARGA DE IMÁGENES
    // ==========================================

    btnOpen.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadImage(e.target.files[0]);
        }
    });

    // Drag & Drop
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

    // Portapapeles
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
            alert('Formato de archivo no soportado nativamente.');
            return;
        }

        currentFileName = forceName || file.name;
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                currentImage = img;
                resetTransforms();
                applyAll();
                
                welcomeMsg.style.display = 'none';
                canvasWrapper.style.display = 'block';
                statusInfo.textContent = `Archivo cargado: ${currentFileName}`;
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ==========================================
    // MOTOR DE RENDERIZADO Y FILTROS
    // ==========================================

    function resetTransforms() {
        transform.rotate = 0;
        transform.flipH = 1;
        transform.flipV = 1;
    }

    function applyAll() {
        if (!currentImage) return;

        // 1. Determinar tamaño final considerando rotación
        const isRotated = transform.rotate === 90 || transform.rotate === 270;
        canvas.width = isRotated ? currentImage.height : currentImage.width;
        canvas.height = isRotated ? currentImage.width : currentImage.height;

        resolutionInfo.textContent = `${canvas.width} x ${canvas.height} px`;

        // 2. Limpiar y Preparar transformaciones
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();

        // Mover origen al centro para rotar/voltear
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((transform.rotate * Math.PI) / 180);
        ctx.scale(transform.flipH, transform.flipV);

        // 3. Aplicar Filtros (Usamos ctx.filter para máximo rendimiento nativo)
        const f_br = `brightness(${filters.brightness.value}%)`;
        const f_ct = `contrast(${filters.contrast.value}%)`;
        const f_st = `saturate(${filters.saturation.value}%)`;
        const f_bl = `blur(${filters.blur.value}px)`;
        const f_iv = `invert(${filters.invert.value}%)`;
        
        ctx.filter = `${f_br} ${f_ct} ${f_st} ${f_bl} ${f_iv}`;

        // 4. Dibujar imagen centrada
        ctx.drawImage(
            currentImage,
            -currentImage.width / 2,
            -currentImage.height / 2
        );

        ctx.restore();
    }

    // Listeners de los Sliders
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

    // Herramientas Transformación
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

    // ==========================================
    // EXPORTACIÓN Y PROCESAMIENTO POR LOTES
    // ==========================================

    const exportFormat = document.getElementById('export-format');
    const qualitySlider = document.getElementById('quality');
    const resizeWidthInput = document.getElementById('resize-width');

    qualitySlider.addEventListener('input', (e) => {
        document.getElementById('val-quality').textContent = `${e.target.value}%`;
    });

    btnExport.addEventListener('click', () => {
        if (!currentImage) {
            alert('No hay imagen para exportar.');
            return;
        }

        const format = exportFormat.value;
        const quality = qualitySlider.value / 100;
        let ext = format.split('/')[1];
        if(ext === 'jpeg') ext = 'jpg';

        // Lógica de Redimensionamiento
        const targetWidth = parseInt(resizeWidthInput.value);
        let finalCanvas = canvas;

        if (targetWidth && targetWidth > 0 && targetWidth !== canvas.width) {
            const tempCanvas = document.createElement('canvas');
            const ratio = canvas.height / canvas.width;
            tempCanvas.width = targetWidth;
            tempCanvas.height = targetWidth * ratio;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
            finalCanvas = tempCanvas;
        }

        // Descargar archivo
        finalCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const baseName = currentFileName.substring(0, currentFileName.lastIndexOf('.')) || currentFileName;
            a.href = url;
            a.download = `${baseName}_edited.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
            statusInfo.textContent = 'Imagen exportada exitosamente.';
        }, format, quality);
    });

    // Procesamiento Lote a ZIP (Requiere JSZip)
    btnBatch.addEventListener('click', () => {
        const batchInput = document.createElement('input');
        batchInput.type = 'file';
        batchInput.multiple = true;
        batchInput.accept = 'image/*';
        batchInput.onchange = (e) => handleBatchFiles(e.target.files);
        batchInput.click();
    });

    async function handleBatchFiles(files) {
        if(files.length === 0) return;
        if(typeof JSZip === 'undefined') {
            alert('La librería JSZip no está cargada. Asegúrate de tener conexión o descargarla localmente.');
            return;
        }

        statusInfo.textContent = `Procesando ${files.length} imágenes... Por favor espera.`;
        const zip = new JSZip();
        const format = exportFormat.value;
        const quality = qualitySlider.value / 100;
        let ext = format.split('/')[1];
        if(ext === 'jpeg') ext = 'jpg';

        // Usamos un canvas temporal (off-screen logic)
        const tempCanvas = document.createElement('canvas');
        const tCtx = tempCanvas.getContext('2d');

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.type.match('image.*')) continue;

            const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            
            // Promisify la carga y renderizado
            await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    tempCanvas.width = img.width;
                    tempCanvas.height = img.height;
                    
                    // Aplicar filtros actuales a las imágenes del lote
                    const f_br = `brightness(${filters.brightness.value}%)`;
                    const f_ct = `contrast(${filters.contrast.value}%)`;
                    const f_st = `saturate(${filters.saturation.value}%)`;
                    const f_bl = `blur(${filters.blur.value}px)`;
                    const f_iv = `invert(${filters.invert.value}%)`;
                    tCtx.filter = `${f_br} ${f_ct} ${f_st} ${f_bl} ${f_iv}`;
                    
                    tCtx.drawImage(img, 0, 0);

                    tempCanvas.toBlob((blob) => {
                        zip.file(`${baseName}_converted.${ext}`, blob);
                        resolve();
                    }, format, quality);
                };
                img.src = URL.createObjectURL(file);
            });
        }

        statusInfo.textContent = 'Comprimiendo ZIP...';
        zip.generateAsync({type:"blob"}).then(function(content) {
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = "imagenes_procesadas.zip";
            a.click();
            URL.revokeObjectURL(url);
            statusInfo.textContent = `Lote finalizado. ${files.length} imágenes exportadas.`;
        });
    }
});