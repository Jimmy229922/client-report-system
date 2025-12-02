import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

let templatesCache = [];
let activeTargetElement = null;

function getElements() {
    return {
        fabBtn: document.getElementById('templates-fab-btn'),
        flyout: document.getElementById('templates-flyout'),
        overlay: document.getElementById('templates-overlay'),
        closeBtn: document.getElementById('templates-flyout-close-btn'),
        searchInput: document.getElementById('templates-flyout-search'),
        listContainer: document.getElementById('templates-flyout-list'),
        manageLink: document.getElementById('manage-templates-link')
    };
}

function showWidget() {
    const { flyout, overlay } = getElements();
    if (flyout && overlay) {
        overlay.classList.add('open');
        flyout.classList.add('open');
    }
}

function hideWidget() {
    const { flyout, overlay } = getElements();
    if (flyout && overlay) {
        overlay.classList.remove('open');
        flyout.classList.remove('open');
        activeTargetElement = null;
    }
}

function renderTemplates(templates) {
    const { listContainer } = getElements();
    if (!listContainer) return;

    if (templates.length === 0) {
        listContainer.innerHTML = '<div class="widget-placeholder">لا توجد قوالب.</div>';
        return;
    }

    listContainer.innerHTML = templates.map(template => `
        <div class="template-btn" data-content="${escape(template.content)}" data-title="${escape(template.title)}">
            ${template.title}
        </div>
    `).join('');
}

async function fetchTemplates() {
    const { listContainer } = getElements();
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="spinner"></div>';
    try {
        const result = await fetchWithAuth('/api/templates');
        templatesCache = result.data || [];
        renderTemplates(templatesCache);
    } catch (error) {
        console.error("Failed to fetch templates for widget:", error);
        listContainer.innerHTML = '<div class="widget-placeholder error">فشل التحميل.</div>';
    }
}

export function openTemplatesWidget(targetElement = null) {
    activeTargetElement = targetElement;
    showWidget();
    if (templatesCache.length === 0) {
        fetchTemplates();
    }
}

export function initTemplatesWidget() {
    const { fabBtn, closeBtn, overlay, manageLink, searchInput, listContainer } = getElements();

    if (!fabBtn || !listContainer) {
        console.warn("Templates widget elements not found.");
        return;
    }

    fabBtn.addEventListener('click', () => {
        openTemplatesWidget(null);
    });

    closeBtn.addEventListener('click', hideWidget);
    overlay.addEventListener('click', hideWidget);
    manageLink.addEventListener('click', () => hideWidget());

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = templatesCache.filter(t =>
            t.title.toLowerCase().includes(searchTerm) ||
            t.content.toLowerCase().includes(searchTerm)
        );
        renderTemplates(filtered);
    });

    listContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.template-btn');
        if (!item) return;

        const title = unescape(item.dataset.title);
        const content = unescape(item.dataset.content);

        let targetTextarea = activeTargetElement;
        
        if (!targetTextarea) {
            targetTextarea = document.querySelector('#report-text') || 
                             document.querySelector('#notes') || 
                             document.querySelector('#additional-notes');
        }

        if (targetTextarea) {
            const currentVal = targetTextarea.value;
            const separator = currentVal.trim().length > 0 ? '\n' : '';
            targetTextarea.value = currentVal + separator + content;
            targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));

            const { flyout } = getElements();
            if (flyout) flyout.dispatchEvent(new CustomEvent('templateInserted'));

            showToast(`تم إدراج قالب: ${title}`);
            hideWidget();
        } else {
            showToast('لم يتم العثور على حقل ملاحظات لإدراج القالب فيه.', true);
        }
    });
}
