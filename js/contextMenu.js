export function setupContextMenu(editor) {
    const opcionesMenu = {
        scope: document.body,
        customClass: 'context-menu',
        menuItems: [
            {
                label: 'Copy image',
                iconHTML: '📋',
                callback: () => {
                    if (!editor.getImage()) {
                        editor.statusInfo.textContent = 'No image to copy.';
                        return;
                    }

                    editor.canvas.toBlob((blob) => {
                        try {
                            const item = new ClipboardItem({ 'image/png': blob });

                            navigator.clipboard.write([item]).then(() => {
                                editor.statusInfo.textContent = 'Image copied to clipboard!';
                            }).catch(err => {
                                console.error('Error while trying to copy the image to clipboard:', err);
                                editor.statusInfo.textContent = 'Error while trying to copy the image to clipboard ❌';
                            });
                        } catch (error) {
                            console.error('El navegador no soporta esta acción:', error);
                            editor.statusInfo.textContent = 'Your browser doesnt support copying images to clipboard ❌';
                        }
                    }, 'image/png');
                }
            },
            {
                label: 'Close image',
                iconHTML: '❌',
                callback: () => {
                    if (!editor.getImage()) return;

                    editor.setImage(null);
                    editor.setFileName('');
                    
                    editor.ctx.clearRect(0, 0, editor.canvas.width, editor.canvas.height);

                    editor.welcomeMsg.style.display = 'block';
                    editor.canvasWrapper.style.display = 'none';
                    editor.imageBox.style.display = 'none';
                    editor.propertiesPanel.style.display = 'none';
                    editor.sidebarResizer.style.display = 'none';

                    editor.zoomVal.textContent = '100%';
                    editor.canvasWrapper.style.transform = 'scale(1)';
                    editor.zoomToast.classList.remove('show');
                    editor.zoomScrubber.style.display = 'none';

                    document.getElementById('btn-reset').click();
                    editor.btnToolMove.click();

                    editor.statusInfo.textContent = 'Image closed.';
                    editor.resolutionInfo.textContent = '';
                    editor.resetZoomState();

                    localStorage.removeItem('savedImage');
                    localStorage.removeItem('savedFileName');
                    localStorage.removeItem('savedMimeType');
                    localStorage.removeItem('editorSettings');
                }
            }
        ]
    };

    return new VanillaContextMenu(opcionesMenu);
}