// Words on the public booking page and in its emails: English, French,
// Spanish. Pure data (see booking.test.ts: every language has every key).

import type { BookingLang, LocationKind } from "./booking.ts";

const en = {
  pick_type: "Pick a meeting",
  minutes: "{n} min",
  pick_day: "Pick a day",
  pick_time: "Pick a time",
  times_in: "Times are in",
  change_zone: "Change",
  no_times: "No open times this month.",
  next_month: "Next month",
  prev_month: "Previous month",
  loading: "Loading times…",
  back: "Back",
  your_details: "Your details",
  name: "Your name",
  email: "Email",
  phone: "Phone",
  phone_optional: "Phone (optional)",
  note: "Anything to share before we meet? (optional)",
  required: "required",
  choose: "Choose…",
  confirm: "Confirm booking",
  booking: "Booking…",
  deposit_note: "A deposit of {amount} is asked for this meeting. You'll get a payment link by email.",
  location_video: "Video call",
  location_phone: "Phone call",
  location_in_person: "In person",
  location_we_call: "We'll call you",
  err_name: "Please tell us your name.",
  err_email: "Please check your email address.",
  err_phone: "Please check your phone number.",
  err_required: "Please answer the required questions.",
  err_taken: "Sorry, that time was just taken. Please pick another one.",
  err_rate: "You've made a few bookings already. Please try again in an hour.",
  err_closed: "This booking can't be changed any more.",
  err_generic: "Something went wrong. Please try again.",
  err_unavailable: "This booking page isn't available right now.",
  confirmed_title: "You're booked!",
  confirmed_sub: "A confirmation is on its way to {email}.",
  confirmed_no_email: "Save this page: it has your booking details and the links to change it.",
  when: "When",
  with: "With",
  where: "Where",
  add_to_calendar: "Add to calendar",
  google_calendar: "Google Calendar",
  download_ics: "Apple / Outlook (.ics)",
  reschedule: "Reschedule",
  cancel: "Cancel booking",
  cancel_confirm: "Cancel this booking?",
  cancelled_title: "Booking cancelled",
  cancelled_sub: "The time is free again. You can book a new one any time.",
  book_again: "Book another time",
  rescheduled_title: "Booking moved",
  pick_new_time: "Pick a new time",
  keep_time: "Keep my time",
  status_attended: "This meeting took place.",
  status_no_show: "This meeting was missed.",
  past: "This meeting has already happened.",
  powered: "Booking by",
  // emails
  mail_confirm_subject: "Booked: {type} with {business}, {when}",
  mail_confirm_body:
    "Hi {name},\n\nYou're booked for {type} with {business}.\n\nWhen: {when} ({tz})\nWhere: {where}\n\nNeed to change it?\nReschedule: {reschedule}\nCancel: {cancel}\n\nThe attached file adds it to your calendar.\n\n{business}",
  mail_owner_subject: "New booking: {name}, {when}",
  mail_owner_body:
    "{name} booked {type}.\n\nWhen: {when} ({tz})\nEmail: {email}\nPhone: {phone}\nNote: {note}\n{answers}\nIt's on your Jephelen calendar.\n{bookings}",
  mail_reminder_subject: "Reminder: {type} with {business}, {when}",
  mail_reminder_body:
    "Hi {name},\n\nA reminder of your {type} with {business} {soon}.\n\nWhen: {when} ({tz})\nWhere: {where}\n\nReschedule: {reschedule}\nCancel: {cancel}\n\n{business}",
  soon_24h: "tomorrow",
  soon_1h: "in about an hour",
  mail_cancel_subject: "Cancelled: {type} with {business}, {when}",
  mail_cancel_body:
    "Hi {name},\n\nYour {type} with {business} on {when} ({tz}) is cancelled.\n\nBook a new time: {book}\n\n{business}",
  mail_owner_cancel_subject: "Booking cancelled: {name}, {when}",
  mail_owner_cancel_body: "{name} cancelled {type} on {when} ({tz}).",
  mail_move_subject: "Moved: {type} with {business}, now {when}",
  mail_owner_move_subject: "Booking moved: {name}, now {when}",
  mail_owner_move_body: "{name} moved {type} to {when} ({tz}). It was {old}.",
};

type Dict = typeof en;

const fr: Dict = {
  pick_type: "Choisissez un rendez-vous",
  minutes: "{n} min",
  pick_day: "Choisissez un jour",
  pick_time: "Choisissez une heure",
  times_in: "Heures affichées en",
  change_zone: "Changer",
  no_times: "Aucune plage libre ce mois-ci.",
  next_month: "Mois suivant",
  prev_month: "Mois précédent",
  loading: "Chargement des heures…",
  back: "Retour",
  your_details: "Vos coordonnées",
  name: "Votre nom",
  email: "Courriel",
  phone: "Téléphone",
  phone_optional: "Téléphone (facultatif)",
  note: "Quelque chose à partager avant la rencontre? (facultatif)",
  required: "obligatoire",
  choose: "Choisir…",
  confirm: "Confirmer",
  booking: "Réservation…",
  deposit_note: "Un dépôt de {amount} est demandé pour ce rendez-vous. Vous recevrez un lien de paiement par courriel.",
  location_video: "Appel vidéo",
  location_phone: "Appel téléphonique",
  location_in_person: "En personne",
  location_we_call: "Nous vous appellerons",
  err_name: "Veuillez indiquer votre nom.",
  err_email: "Veuillez vérifier votre courriel.",
  err_phone: "Veuillez vérifier votre numéro de téléphone.",
  err_required: "Veuillez répondre aux questions obligatoires.",
  err_taken: "Désolé, cette heure vient d'être prise. Choisissez-en une autre.",
  err_rate: "Vous avez déjà fait quelques réservations. Réessayez dans une heure.",
  err_closed: "Cette réservation ne peut plus être modifiée.",
  err_generic: "Une erreur est survenue. Veuillez réessayer.",
  err_unavailable: "Cette page de réservation n'est pas disponible pour le moment.",
  confirmed_title: "C'est réservé!",
  confirmed_sub: "Une confirmation est en route vers {email}.",
  confirmed_no_email: "Gardez cette page : elle contient votre réservation et les liens pour la modifier.",
  when: "Quand",
  with: "Avec",
  where: "Où",
  add_to_calendar: "Ajouter au calendrier",
  google_calendar: "Google Agenda",
  download_ics: "Apple / Outlook (.ics)",
  reschedule: "Changer l'heure",
  cancel: "Annuler",
  cancel_confirm: "Annuler cette réservation?",
  cancelled_title: "Réservation annulée",
  cancelled_sub: "L'heure est de nouveau libre. Vous pouvez réserver à nouveau quand vous voulez.",
  book_again: "Réserver une autre heure",
  rescheduled_title: "Réservation déplacée",
  pick_new_time: "Choisissez une nouvelle heure",
  keep_time: "Garder mon heure",
  status_attended: "Ce rendez-vous a eu lieu.",
  status_no_show: "Ce rendez-vous a été manqué.",
  past: "Ce rendez-vous est déjà passé.",
  powered: "Réservation par",
  mail_confirm_subject: "Réservé : {type} avec {business}, {when}",
  mail_confirm_body:
    "Bonjour {name},\n\nVotre rendez-vous {type} avec {business} est confirmé.\n\nQuand : {when} ({tz})\nOù : {where}\n\nBesoin de changer?\nChanger l'heure : {reschedule}\nAnnuler : {cancel}\n\nLe fichier joint l'ajoute à votre calendrier.\n\n{business}",
  mail_owner_subject: "Nouvelle réservation : {name}, {when}",
  mail_owner_body:
    "{name} a réservé {type}.\n\nQuand : {when} ({tz})\nCourriel : {email}\nTéléphone : {phone}\nNote : {note}\n{answers}\nC'est dans votre calendrier Jephelen.\n{bookings}",
  mail_reminder_subject: "Rappel : {type} avec {business}, {when}",
  mail_reminder_body:
    "Bonjour {name},\n\nUn rappel de votre rendez-vous {type} avec {business} {soon}.\n\nQuand : {when} ({tz})\nOù : {where}\n\nChanger l'heure : {reschedule}\nAnnuler : {cancel}\n\n{business}",
  soon_24h: "demain",
  soon_1h: "dans environ une heure",
  mail_cancel_subject: "Annulé : {type} avec {business}, {when}",
  mail_cancel_body:
    "Bonjour {name},\n\nVotre rendez-vous {type} avec {business} le {when} ({tz}) est annulé.\n\nRéserver une nouvelle heure : {book}\n\n{business}",
  mail_owner_cancel_subject: "Réservation annulée : {name}, {when}",
  mail_owner_cancel_body: "{name} a annulé {type} le {when} ({tz}).",
  mail_move_subject: "Déplacé : {type} avec {business}, maintenant {when}",
  mail_owner_move_subject: "Réservation déplacée : {name}, maintenant {when}",
  mail_owner_move_body: "{name} a déplacé {type} au {when} ({tz}). C'était {old}.",
};

const es: Dict = {
  pick_type: "Elige una reunión",
  minutes: "{n} min",
  pick_day: "Elige un día",
  pick_time: "Elige una hora",
  times_in: "Horas en",
  change_zone: "Cambiar",
  no_times: "No hay horas libres este mes.",
  next_month: "Mes siguiente",
  prev_month: "Mes anterior",
  loading: "Cargando horas…",
  back: "Atrás",
  your_details: "Tus datos",
  name: "Tu nombre",
  email: "Correo",
  phone: "Teléfono",
  phone_optional: "Teléfono (opcional)",
  note: "¿Algo que quieras contarnos antes? (opcional)",
  required: "obligatorio",
  choose: "Elegir…",
  confirm: "Confirmar reserva",
  booking: "Reservando…",
  deposit_note: "Se pide un depósito de {amount} para esta reunión. Recibirás un enlace de pago por correo.",
  location_video: "Videollamada",
  location_phone: "Llamada telefónica",
  location_in_person: "En persona",
  location_we_call: "Te llamamos",
  err_name: "Por favor, dinos tu nombre.",
  err_email: "Revisa tu correo, por favor.",
  err_phone: "Revisa tu número de teléfono, por favor.",
  err_required: "Responde las preguntas obligatorias, por favor.",
  err_taken: "Lo sentimos, esa hora se acaba de ocupar. Elige otra.",
  err_rate: "Ya hiciste algunas reservas. Inténtalo de nuevo en una hora.",
  err_closed: "Esta reserva ya no se puede cambiar.",
  err_generic: "Algo salió mal. Inténtalo de nuevo.",
  err_unavailable: "Esta página de reservas no está disponible ahora.",
  confirmed_title: "¡Reservado!",
  confirmed_sub: "Te enviamos una confirmación a {email}.",
  confirmed_no_email: "Guarda esta página: tiene tu reserva y los enlaces para cambiarla.",
  when: "Cuándo",
  with: "Con",
  where: "Dónde",
  add_to_calendar: "Añadir al calendario",
  google_calendar: "Google Calendar",
  download_ics: "Apple / Outlook (.ics)",
  reschedule: "Cambiar hora",
  cancel: "Cancelar reserva",
  cancel_confirm: "¿Cancelar esta reserva?",
  cancelled_title: "Reserva cancelada",
  cancelled_sub: "La hora está libre otra vez. Puedes reservar de nuevo cuando quieras.",
  book_again: "Reservar otra hora",
  rescheduled_title: "Reserva cambiada",
  pick_new_time: "Elige una nueva hora",
  keep_time: "Mantener mi hora",
  status_attended: "Esta reunión se realizó.",
  status_no_show: "Esta reunión no se realizó.",
  past: "Esta reunión ya pasó.",
  powered: "Reservas con",
  mail_confirm_subject: "Reservado: {type} con {business}, {when}",
  mail_confirm_body:
    "Hola {name},\n\nTu {type} con {business} está confirmada.\n\nCuándo: {when} ({tz})\nDónde: {where}\n\n¿Necesitas cambiarla?\nCambiar hora: {reschedule}\nCancelar: {cancel}\n\nEl archivo adjunto la añade a tu calendario.\n\n{business}",
  mail_owner_subject: "Nueva reserva: {name}, {when}",
  mail_owner_body:
    "{name} reservó {type}.\n\nCuándo: {when} ({tz})\nCorreo: {email}\nTeléfono: {phone}\nNota: {note}\n{answers}\nEstá en tu calendario de Jephelen.\n{bookings}",
  mail_reminder_subject: "Recordatorio: {type} con {business}, {when}",
  mail_reminder_body:
    "Hola {name},\n\nTe recordamos tu {type} con {business} {soon}.\n\nCuándo: {when} ({tz})\nDónde: {where}\n\nCambiar hora: {reschedule}\nCancelar: {cancel}\n\n{business}",
  soon_24h: "mañana",
  soon_1h: "en una hora aproximadamente",
  mail_cancel_subject: "Cancelada: {type} con {business}, {when}",
  mail_cancel_body:
    "Hola {name},\n\nTu {type} con {business} el {when} ({tz}) está cancelada.\n\nReserva una nueva hora: {book}\n\n{business}",
  mail_owner_cancel_subject: "Reserva cancelada: {name}, {when}",
  mail_owner_cancel_body: "{name} canceló {type} el {when} ({tz}).",
  mail_move_subject: "Cambiada: {type} con {business}, ahora {when}",
  mail_owner_move_subject: "Reserva cambiada: {name}, ahora {when}",
  mail_owner_move_body: "{name} cambió {type} a {when} ({tz}). Antes era {old}.",
};

export type BookingKey = keyof Dict;

export const BOOKING_STRINGS: Record<BookingLang, Dict> = { en, fr, es };

export function bt(lang: BookingLang | string | null | undefined, key: BookingKey, vars: Record<string, string | number> = {}): string {
  const dict = BOOKING_STRINGS[(lang as BookingLang) in BOOKING_STRINGS ? (lang as BookingLang) : "en"];
  return dict[key].replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function locationLabel(lang: BookingLang | string, kind: LocationKind | string): string {
  const key = `location_${kind}` as BookingKey;
  return key in en ? bt(lang, key) : bt(lang, "location_video");
}

// "Tuesday, September 29, 2026 at 1:00 PM" in a zone and language.
export function formatWhen(ms: number, tz: string, lang: string): string {
  const locale = lang === "fr" ? "fr-CA" : lang === "es" ? "es" : "en-US";
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

export function localeFor(lang: string) {
  return lang === "fr" ? "fr-CA" : lang === "es" ? "es" : "en-US";
}
