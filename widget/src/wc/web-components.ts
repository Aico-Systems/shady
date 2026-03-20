import { ensureI18n } from '../i18n';

// Standalone embeds do not pass through the demo app entrypoint,
// so i18n must be initialized here as well.
ensureI18n('en');

import './acBooking.wc.svelte';
