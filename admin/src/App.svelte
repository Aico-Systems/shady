<script lang="ts">
  import { onMount } from 'svelte';
  import {
    initAuth,
    isAuthenticated,
    signIn,
    signOut,
    authReady,
    user,
    currentOrganization,
  } from './lib/auth';
  import UsersPage from './lib/pages/UsersPage.svelte';
  import BookingsPage from './lib/pages/BookingsPage.svelte';
  import ConfigPage from './lib/pages/ConfigPage.svelte';
  import ThemeToggle from './lib/components/ThemeToggle.svelte';
  import LanguageSwitcher from './lib/components/LanguageSwitcher.svelte';
  import { t } from './i18n';
  import { CalendarClock, LogOut, Menu, Settings2, UsersRound, X } from '@lucide/svelte';

  type PageKey = 'users' | 'bookings' | 'config';

  const pages: Record<PageKey, typeof UsersPage | typeof BookingsPage | typeof ConfigPage> = {
    users: UsersPage,
    bookings: BookingsPage,
    config: ConfigPage,
  };

  const navigation = [
    { id: 'users', labelKey: 'navigation.users', icon: UsersRound, accent: 'var(--aico-lime)' },
    { id: 'bookings', labelKey: 'navigation.bookings', icon: CalendarClock, accent: 'var(--aico-mint)' },
    { id: 'config', labelKey: 'navigation.config', icon: Settings2, accent: 'var(--aico-flieder)' },
  ] as const;

  let currentPage = $state<PageKey>('users');
  let loading = $derived(!$authReady);
  let PageComponent = $derived(pages[currentPage] ?? UsersPage);
  let currentNavItem = $derived(navigation.find((item) => item.id === currentPage));
  let mobileNavOpen = $state(false);
  let isMobile = $state(false);
  let sidebarCollapsed = $state(false);

  onMount(() => {
    initAuth();

    const updateRoute = () => {
      const hash = window.location.hash.slice(1) as PageKey;
      if (hash && hash in pages) {
        currentPage = hash;
      } else {
        currentPage = 'users';
      }
      mobileNavOpen = false;
    };

    const handleResize = () => {
      isMobile = window.innerWidth <= 960;
      if (!isMobile) {
        mobileNavOpen = false;
      } else {
        sidebarCollapsed = false;
      }
    };

    updateRoute();
    handleResize();
    window.addEventListener('hashchange', updateRoute);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('hashchange', updateRoute);
      window.removeEventListener('resize', handleResize);
    };
  });

  function navigate(page: PageKey) {
    window.location.hash = page;
    if (window.innerWidth <= 960) {
      mobileNavOpen = false;
    }
  }

  function toggleSidebar() {
    if (isMobile) {
      mobileNavOpen = true;
    } else {
      sidebarCollapsed = !sidebarCollapsed;
    }
  }

  function closeMobileNav() {
    mobileNavOpen = false;
  }
</script>

<svelte:head>
  <title>{$t('app.meta.title')}</title>
</svelte:head>

{#if loading}
  <section class="full-state">
    <div class="glass-card">
      <div class="spinner"></div>
      <p>{$t('states.initializing')}</p>
    </div>
  </section>
{:else if !$isAuthenticated}
  <section class="full-state">
    <div class="glass-card compact">
      <h1>{$t('auth.title')}</h1>
      <p>{$t('auth.subtitle')}</p>
      <button class="cta" type="button" onclick={signIn}>
        {$t('auth.signIn')}
      </button>
    </div>
  </section>
{:else if !$currentOrganization}
  <section class="full-state">
    <div class="glass-card compact">
      <h1>{$t('states.noOrgTitle')}</h1>
      <p>{$t('states.noOrgSubtitle')}</p>
    </div>
  </section>
{:else}
  <div
    class="admin-shell"
    class:nav-open={mobileNavOpen}
    class:sidebar-collapsed={!isMobile && sidebarCollapsed}
  >
    <aside class="admin-sidebar" class:open={mobileNavOpen}>
      <div class="sidebar-brand">
        <div class="brand-mark">
          {( $currentOrganization?.name || $t('app.meta.title'))[0]?.toUpperCase?.() ?? 'A'}
        </div>
        <div class="brand-meta">
          <p>{$t('app.meta.title')}</p>
          <span>{$currentOrganization?.name}</span>
        </div>
        <button
          class="icon-button sidebar-close"
          type="button"
          aria-label={$t('actions.closeMenu')}
          onclick={closeMobileNav}
        >
          <X size={16} />
        </button>
      </div>

      <div class="sidebar-body">
        <nav class="sidebar-nav" aria-label="Primary">
          {#each navigation as item}
            <button
              type="button"
              class:selected={currentPage === item.id}
              onclick={() => navigate(item.id)}
              aria-current={currentPage === item.id ? 'page' : undefined}
              style={`--nav-accent:${item.accent}`}
            >
              <span class="icon-wrapper">
                <item.icon size={18} />
              </span>
              <span>{$t(item.labelKey)}</span>
              <span class="nav-indicator" aria-hidden="true"></span>
            </button>
          {/each}
        </nav>
      </div>

      <footer class="sidebar-footer">
        <button class="sidebar-logout" type="button" onclick={signOut}>
          <LogOut size={16} />
          <span>{$t('actions.logout')}</span>
        </button>
      </footer>
    </aside>

    <div class="sidebar-overlay" aria-hidden={!mobileNavOpen} onclick={closeMobileNav}></div>

    <section class="admin-main">
      <div class="admin-main__inner">
        <header class="command-bar">
          <div class="command-bar__left">
            <button
              class="icon-button sidebar-toggle"
              type="button"
              aria-label={$t('actions.openMenu')}
              onclick={toggleSidebar}
            >
              <Menu size={18} />
            </button>
            <div class="headline">
              <p class="eyebrow subtle">
                {$t('app.welcome', { values: { name: $user?.name || $user?.email || '' } })}
              </p>
              <div class="title-row">
                <h2>{$t('app.headline')}</h2>
                <span class="page-chip">
                  {$t(currentNavItem?.labelKey ?? 'navigation.users')}
                </span>
              </div>
              <p class="subtle">{$t('app.subheadline')}</p>
            </div>
          </div>
          <div class="command-bar__right">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <div class="meta-strip" role="list">
          <div class="meta-chip" role="listitem">
            <span>{$t('insights.organization')}</span>
            <strong>{$currentOrganization?.name}</strong>
          </div>
          <div class="meta-chip" role="listitem">
            <span>{$t('insights.identity')}</span>
            <strong>{$user?.email}</strong>
          </div>
          <div class="meta-chip" role="listitem">
            <span>{$t('insights.status')}</span>
            <strong>{$t(currentNavItem?.labelKey ?? 'navigation.users')}</strong>
          </div>
        </div>

        <div class="page-surface">
          <PageComponent />
        </div>
      </div>
    </section>
  </div>
{/if}

<style>
  .full-state {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2.5rem;
    background: radial-gradient(circle at top, rgba(var(--aico-mint-rgb), 0.18), transparent 55%),
      linear-gradient(135deg, var(--aico-color-bg-primary), var(--aico-color-bg-secondary));
  }

  .glass-card {
    background: color-mix(in srgb, var(--aico-color-bg-primary) 92%, transparent);
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 70%, transparent);
    border-radius: 28px;
    padding: 2.75rem;
    box-shadow: 0 18px 60px rgba(15, 23, 42, 0.18);
    text-align: center;
    max-width: 420px;
    width: 100%;
    backdrop-filter: blur(14px);
  }

  .glass-card.compact {
    padding: 2rem;
  }

  .glass-card h1 {
    margin-bottom: 1rem;
    font-size: clamp(1.5rem, 2vw, 2rem);
  }

  .glass-card p {
    color: var(--aico-color-text-secondary);
    margin-bottom: 1.5rem;
  }

  .cta {
    width: 100%;
  }

  .admin-shell {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    height: 100dvh;
    background: var(--aico-color-bg-secondary);
  }

  .admin-shell.sidebar-collapsed {
    grid-template-columns: 0 minmax(0, 1fr);
  }

  .admin-shell.sidebar-collapsed .admin-sidebar {
    opacity: 0;
    pointer-events: none;
  }

  .admin-sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem;
    background: var(--aico-color-bg-primary);
    border-right: 1px solid color-mix(in srgb, var(--aico-color-border-light) 75%, transparent);
    z-index: 25;
    transition: transform var(--sidebar-transition);
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .brand-mark {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    background: linear-gradient(135deg, var(--aico-mint), var(--aico-flieder));
    color: white;
    letter-spacing: 0.05em;
  }

  .brand-meta p {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .brand-meta span {
    color: var(--aico-color-text-tertiary);
    font-size: 0.85rem;
  }

  .sidebar-close {
    margin-left: auto;
    display: none;
  }

  .sidebar-body {
    flex: 1;
    overflow-y: auto;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .sidebar-nav button {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--aico-color-text-tertiary);
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.55rem 0.6rem;
    font-weight: 600;
    justify-content: flex-start;
    transition: color var(--transition-duration-fast) var(--transition-easing);
  }

  .sidebar-nav button:hover {
    color: var(--aico-color-text-primary);
  }

  .sidebar-nav button.selected {
    color: var(--aico-color-text-primary);
  }

  .sidebar-nav button .icon-wrapper {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--aico-color-text-secondary);
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 70%, transparent);
  }

  .sidebar-nav button.selected .icon-wrapper {
    color: var(--nav-accent);
    border-color: var(--nav-accent);
  }

  .nav-indicator {
    margin-left: auto;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--nav-accent);
    opacity: 0;
    transform: scale(0.6);
    transition: var(--transition-transform), opacity var(--transition-duration-fast);
  }

  .sidebar-nav button.selected .nav-indicator {
    opacity: 1;
    transform: scale(1);
  }

  .sidebar-footer {
    border-top: 1px solid color-mix(in srgb, var(--aico-color-border-light) 60%, transparent);
    padding-top: 1rem;
  }

  .sidebar-logout {
    width: 100%;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 70%, transparent);
    background: transparent;
    color: var(--aico-color-text-secondary);
    padding: 0.6rem 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
  }

  .sidebar-logout:hover {
    color: var(--aico-color-text-primary);
    border-color: var(--aico-color-border-light);
  }

  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    z-index: 20;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-duration-fast);
  }

  .admin-shell.nav-open .sidebar-overlay {
    opacity: 1;
    pointer-events: all;
  }

  .admin-main {
    min-height: 100%;
    overflow-y: auto;
    padding: 2rem clamp(1.5rem, 3vw, 2.5rem);
    background: var(--aico-color-bg-secondary);
    scrollbar-gutter: stable;
  }

  .admin-main__inner {
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .command-bar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.4rem;
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 70%, transparent);
    background: var(--aico-color-bg-primary);
    position: sticky;
    top: 1rem;
    z-index: 5;
  }

  .command-bar__left {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .command-bar__right {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .command-bar__right :global(.lang-toggle),
  .command-bar__right :global(.theme-toggle) {
    flex-shrink: 0;
  }

  .sidebar-toggle {
    display: inline-flex;
  }

  .headline h2 {
    margin: 0;
    font-size: clamp(1.35rem, 2vw, 1.75rem);
  }

  .headline .subtle {
    color: var(--aico-color-text-tertiary);
    margin: 0.25rem 0 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .page-chip {
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--aico-color-text-tertiary);
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 55%, transparent);
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
  }

  .icon-button {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 70%, transparent);
    background: var(--aico-color-bg-primary);
    color: var(--aico-color-text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .meta-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.5rem;
  }

  .meta-chip {
    border-radius: 12px;
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 65%, transparent);
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .meta-chip span {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--aico-color-text-tertiary);
  }

  .meta-chip strong {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--aico-color-text-primary);
  }

  .page-surface {
    background: var(--aico-color-bg-primary);
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 70%, transparent);
    padding: clamp(1rem, 2vw, 1.5rem);
    box-shadow: none;
    min-height: 50vh;
  }

  .spinner {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 4px solid color-mix(in srgb, var(--aico-grey-400) 40%, transparent);
    border-top-color: var(--aico-mint);
    animation: spin 0.8s linear infinite;
    margin: 0 auto 1rem auto;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 960px) {
    .admin-shell,
    .admin-shell.sidebar-collapsed {
      grid-template-columns: 1fr;
      height: auto;
    }

    .admin-shell.sidebar-collapsed .admin-sidebar {
      opacity: 1;
    }

    .admin-sidebar {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      width: min(320px, 82vw);
      transform: translateX(-100%);
      border-right: none;
      box-shadow: none;
      padding: 1.25rem;
    }

    .admin-sidebar.open {
      transform: translateX(0);
    }

    .sidebar-close {
      display: inline-flex;
    }

    .sidebar-footer {
      display: none;
    }

    .admin-main {
      padding: 1.25rem;
      overflow: visible;
    }

    .command-bar {
      position: static;
      flex-direction: column;
      gap: 1.25rem;
    }

    .command-bar__left,
    .command-bar__right {
      width: 100%;
      flex-wrap: wrap;
    }

    .command-bar__right {
      justify-content: flex-start;
    }

    .sidebar-toggle {
      display: inline-flex;
    }
  }
</style>
