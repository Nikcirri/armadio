import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { installGlobalErrorHandlers, reportError } from './lib/errors';
import { requestPersistentStorage } from './lib/platform';
import { startSettings } from './lib/state/settings.svelte';

installGlobalErrorHandlers();
void requestPersistentStorage();
startSettings((e) => reportError(e, 'Non riesco a leggere i dati dell’app.'));

const target = document.getElementById('app');
if (!target) throw new Error('Elemento #app non trovato');

const app = mount(App, { target });

export default app;
