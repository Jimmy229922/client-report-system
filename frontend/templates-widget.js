import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

export function initTemplatesWidget() {
    const fabBtn = document.getElementById('templates-fab-btn');
    const flyout = document.getElementById('templates-flyout');
    const overlay = document.getElementById('templates-overlay');
    const closeBtn = document.getElementById('templates-flyout-close-btn');
    const searchInput = document.getElementById('templates-flyout-search');
    const listContainer = document.getElementById('templates-flyout-list');
    const manageLink = document.getElementById('manage-templates-link');

    if (!fabBtn || !flyout || !overlay || !closeBtn || !searchInput || !listContainer || !manageLink) {
        console.warn("Templates widget elements not found, widget will not be initialized.");
        return;
    }

    let templatesCache = []; // Cache for templates

    const showWidget = () => {
        overlay.classList.add('open');
        flyout.classList.add('open');
    };

    const hideWidget = () => {
        overlay.classList.remove('open');
        flyout.classList.remove('open');
    };

    const renderTemplates = (templates) => {
        if (templates.length === 0) {
            listContainer.innerHTML = '<div class="widget-placeholder">لا توجد قوالب.</div>';
            return;
        }

        listContainer.innerHTML = templates.map(template => `
            <div class="template-btn" data-content="${escape(template.content)}" data-title="${escape(template.title)}">
                ${template.title}
            </div>
        `).join('');
    };

    const fetchTemplates = async () => {
        listContainer.innerHTML = '<div class="spinner"></div>';
        try {
            const result = await fetchWithAuth('/api/templates');
            templatesCache = result.data || [];
            renderTemplates(templatesCache);
        } catch (error) {
            console.error("Failed to fetch templates for widget:", error);
            listContainer.innerHTML = '<div class="widget-placeholder error">فشل التحميل.</div>';
        }
    };

    fabBtn.addEventListener('click', () => {
        showWidget();
        if (templatesCache.length === 0) {
            fetchTemplates();
        }
    });

    closeBtn.addEventListener('click', hideWidget);
    overlay.addEventListener('click', hideWidget);
    manageLink.addEventListener('click', (e) => {
        // We don't prevent default, so it navigates. We just hide the flyout.
        hideWidget();
    });

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = templatesCache.filter(t =>
            t.title.toLowerCase().includes(searchTerm) ||
            t.content.toLowerCase().includes(searchTerm)
        );
        renderTemplates(filtered);
    });

    // Use event delegation for template items
    listContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.template-btn');
        if (!item) return;

        const title = unescape(item.dataset.title);
        const content = unescape(item.dataset.content);

        // Find the primary textarea on the current page.
        // It could be in the reports page (#report-text) or other pages.
        const targetTextarea = document.querySelector('#report-text') || document.querySelector('#notes') || document.querySelector('#additional-notes');

        if (targetTextarea) {
            const currentVal = targetTextarea.value;
            const separator = currentVal.trim().length > 0 ? '\n' : '';
            targetTextarea.value = currentVal + separator + content;
            targetTextarea.dispatchEvent(new Event('input', { bubbles: true })); // Trigger form state updates

            // إرسال حدث مخصص لإعلام الصفحة بأنه تم إدراج قالب
            flyout.dispatchEvent(new CustomEvent('templateInserted'));

            showToast(`تم إدراج قالب: ${title}`);
            hideWidget();
        } else {
            showToast('لم يتم العثور على حقل ملاحظات لإدراج القالب فيه.', true);
        }
    });
}
