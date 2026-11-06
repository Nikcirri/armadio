import { todayKey } from '../logic/util';

/** Agenda: sezione, vista del calendario, giorno scelto e viaggio aperto restano finché l'app è aperta. */
export const agendaView = $state<{
  section: 'calendar' | 'trips';
  mode: 'week' | 'month';
  /** Giorno scelto nel calendario. */
  selected: string;
  /** Giorno che decide quale settimana o mese si vede. */
  anchor: string;
  tripDetail: string | null;
}>({
  section: 'calendar',
  mode: 'week',
  selected: todayKey(),
  anchor: todayKey(),
  tripDetail: null,
});
