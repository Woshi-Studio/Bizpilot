"use client";

import Icon from "@/components/icons";
import { CALENDAR_NEW_EVENT } from "./calendar-grid";

export default function NewEntryButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(CALENDAR_NEW_EVENT))} className="btn-primary">
      <Icon name="plus" className="h-4 w-4" />
      New
    </button>
  );
}
