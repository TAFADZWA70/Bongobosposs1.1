/**
 * Universal Burger Menu Handler
 * A reusable module for implementing responsive mobile navigation menus
 * 
 * Usage:
 * 1. Import or include this file in your HTML
 * 2. Call initBurgerMenu() with your custom selectors
 * 
 * Example:
 * initBurgerMenu({
 *   toggleBtn: '.hamburger',
 *   menu: '.nav-menu',
 *   menuLinks: '.nav-menu a',
 *   closeOnLinkClick: true,
 *   closeOnOutsideClick: true,
 *   closeOnEscape: true,
 *   breakpoint: 768
 * });
 */

class BurgerMenu {
    constructor(options = {}) {
        // Default configuration
        this.config = {
            toggleBtn: options.toggleBtn || '.menu-toggle',
            menu: options.menu || '.sidebar',
            menuLinks: options.menuLinks || '.menu-link',
            closeOnLinkClick: options.closeOnLinkClick !== false, // Default true
            closeOnOutsideClick: options.closeOnOutsideClick !== false, // Default true
            closeOnEscape: options.closeOnEscape !== false, // Default true
            closeOnResize: options.closeOnResize !== false, // Default true
            breakpoint: options.breakpoint || 768,
            activeClass: options.activeClass || 'active',
            onOpen: options.onOpen || null,
            onClose: options.onClose || null
        };

        this.isOpen = false;
        this.init();
    }

    init() {
        // Get DOM elements
        this.toggleBtn = document.querySelector(this.config.toggleBtn);
        this.menu = document.querySelector(this.config.menu);
        this.menuLinks = document.querySelectorAll(this.config.menuLinks);

        // Check if elements exist
        if (!this.toggleBtn || !this.menu) {
            console.error('BurgerMenu: Toggle button or menu element not found');
            return;
        }

        // Setup event listeners
        this.setupToggleListener();

        if (this.config.closeOnLinkClick) {
            this.setupLinkListeners();
        }

        if (this.config.closeOnOutsideClick) {
            this.setupOutsideClickListener();
        }

        if (this.config.closeOnEscape) {
            this.setupEscapeListener();
        }

        if (this.config.closeOnResize) {
            this.setupResizeListener();
        }

        // Inject hamburger animation styles
        this.injectStyles();

        console.log('BurgerMenu initialized ✓');
    }

    setupToggleListener() {
        this.toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
    }

    setupLinkListeners() {
        this.menuLinks.forEach(link => {
            link.addEventListener('click', () => {
                // Only auto-close on mobile screens
                if (window.innerWidth <= this.config.breakpoint) {
                    this.close();
                }
            });
        });
    }

    setupOutsideClickListener() {
        document.addEventListener('click', (e) => {
            if (this.isOpen &&
                !this.menu.contains(e.target) &&
                !this.toggleBtn.contains(e.target)) {
                this.close();
            }
        });
    }

    setupEscapeListener() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    setupResizeListener() {
        window.addEventListener('resize', () => {
            if (window.innerWidth > this.config.breakpoint && this.isOpen) {
                this.close();
            }
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.menu.classList.add(this.config.activeClass);
        this.toggleBtn.classList.add(this.config.activeClass);
        this.isOpen = true;

        // Add body scroll lock on mobile
        if (window.innerWidth <= this.config.breakpoint) {
            document.body.style.overflow = 'hidden';
        }

        // Call custom callback if provided
        if (typeof this.config.onOpen === 'function') {
            this.config.onOpen();
        }
    }

    close() {
        this.menu.classList.remove(this.config.activeClass);
        this.toggleBtn.classList.remove(this.config.activeClass);
        this.isOpen = false;

        // Remove body scroll lock
        document.body.style.overflow = '';

        // Call custom callback if provided
        if (typeof this.config.onClose === 'function') {
            this.config.onClose();
        }
    }

    injectStyles() {
        // Check if styles already injected
        if (document.getElementById('burger-menu-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'burger-menu-styles';
        style.textContent = `
            /* Burger Menu Universal Styles */
            .menu-toggle {
                cursor: pointer;
                transition: transform 0.3s ease;
                z-index: 1001;
            }
            
            .menu-toggle.active {
                transform: rotate(90deg);
            }
            
            /* Hamburger icon animation (if using Font Awesome bars icon) */
            .menu-toggle i {
                transition: all 0.3s ease;
            }
            
            /* Smooth menu transitions */
            .sidebar,
            .nav-menu {
                transition: transform 0.3s ease, opacity 0.3s ease;
            }
            
            /* Prevent body scroll when menu is open on mobile */
            @media (max-width: 768px) {
                body.menu-open {
                    overflow: hidden;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Public methods for manual control
    destroy() {
        // Remove all event listeners and clean up
        this.close();
        console.log('BurgerMenu destroyed');
    }
}

// Factory function for easy initialization
function initBurgerMenu(options = {}) {
    return new BurgerMenu(options);
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BurgerMenu, initBurgerMenu };
}

// Make available globally
window.BurgerMenu = BurgerMenu;
window.initBurgerMenu = initBurgerMenu;