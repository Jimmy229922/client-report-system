import imageCompression from './node_modules/browser-image-compression/dist/browser-image-compression.mjs';
import { showToast } from './ui.js';

/**
 * Shared image uploader with drag/drop/paste support, compression, previews, and max-count enforcement.
 * @param {Object} options
 * @param {HTMLElement} options.uploadArea - Drop/click target.
 * @param {HTMLElement} options.previewsContainer - Container for thumbnails.
 * @param {number} [options.maxImages=10] - Max images allowed.
 * @param {boolean} [options.allowPaste=true] - Whether to bind document paste.
 * @param {Object} [options.compressionOptions] - browser-image-compression options.
 * @param {Function} [options.onChange] - Called with current files array whenever it changes.
 * @returns {{getFiles: Function, reset: Function, destroy: Function, addFiles: Function}}
 */
export function createImageUploader({
    uploadArea,
    previewsContainer,
    maxImages = 10,
    allowPaste = true,
    compressionOptions = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true },
    onChange,
}) {
    if (!uploadArea || !previewsContainer) return null;

    let files = [];
    const listeners = [];

    const notify = () => onChange?.(files);

    const renderPreviews = () => {
        previewsContainer.innerHTML = '';
        files.forEach((fileData, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'img-preview-container';
            wrapper.dataset.blobUrl = fileData.previewUrl;
            wrapper.innerHTML = `
                <img src="${fileData.previewUrl}" class="img-preview">
                <button type="button" class="remove-img-btn">&times;</button>
            `;
            wrapper.querySelector('.remove-img-btn').onclick = () => {
                URL.revokeObjectURL(fileData.previewUrl);
                files = files.filter((f) => f.previewUrl !== fileData.previewUrl);
                renderPreviews();
                notify();
            };
            previewsContainer.appendChild(wrapper);
        });
    };

    const addListener = (el, evt, handler) => {
        el.addEventListener(evt, handler);
        listeners.push([el, evt, handler]);
    };

    const handleFiles = async (incoming) => {
        for (const file of incoming) {
            if (!file.type.startsWith('image/')) continue;

            if (files.length >= maxImages) {
                showToast(`Image limit reached (${maxImages}).`, true);
                break;
            }

            if (files.some((f) => f.originalName === file.name && f.originalSize === file.size)) {
                showToast('This image was already added.', true);
                continue;
            }

            const placeholder = document.createElement('div');
            placeholder.className = 'img-preview-container loading';
            placeholder.innerHTML = `
                <div class="img-preview-spinner"></div>
                <p class="img-preview-loading-text">Compressing image...</p>
            `;
            previewsContainer.appendChild(placeholder);

            try {
                const compressedFile = await imageCompression(file, compressionOptions);
                const fileData = {
                    file: compressedFile,
                    originalName: file.name,
                    originalSize: file.size,
                    previewUrl: URL.createObjectURL(compressedFile),
                };
                files.push(fileData);
                renderPreviews();

                if (files.length >= maxImages) {
                    showToast(`Image limit reached (${maxImages}).`, false);
                }
            } catch (error) {
                console.error('Error during image compression:', error);
                showToast('Could not compress the image.', true);
            } finally {
                placeholder.remove();
            }
        }
        notify();
    };

    addListener(uploadArea, 'dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    addListener(uploadArea, 'dragleave', () => uploadArea.classList.remove('dragover'));

    addListener(uploadArea, 'drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(Array.from(e.dataTransfer.files));
    });

    addListener(uploadArea, 'click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                handleFiles(Array.from(e.target.files));
            }
        };
        input.click();
    });

    let pasteHandler;
    if (allowPaste) {
        pasteHandler = (e) => {
            if (e.clipboardData?.files?.length) {
                e.preventDefault();
                handleFiles(Array.from(e.clipboardData.files));
            }
        };
        document.addEventListener('paste', pasteHandler);
    }

    const reset = () => {
        files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        files = [];
        previewsContainer.innerHTML = '';
        notify();
    };

    const destroy = () => {
        listeners.forEach(([el, evt, handler]) => el.removeEventListener(evt, handler));
        if (pasteHandler) document.removeEventListener('paste', pasteHandler);
        reset();
    };

    return {
        getFiles: () => files.slice(),
        addFiles: (fileList) => handleFiles(Array.from(fileList)),
        reset,
        destroy,
    };
}
