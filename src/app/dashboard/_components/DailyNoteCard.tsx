import React from "react";
import { RiFileTextLine } from "@remixicon/react";

interface DailyNoteCardProps {
  note: string;
  saveStatus: "idle" | "saving" | "saved" | "error";
  handleNoteChange: (val: string) => void;
}

export default function DailyNoteCard({
  note,
  saveStatus,
  handleNoteChange,
}: DailyNoteCardProps) {
  return (
    <div className="notes-card glass-card animate-in">
      <div className="notes-header">
        <span className="notes-header-icon">
          <RiFileTextLine size={20} />
        </span>
        <span className="notes-title">Daily Note</span>
        <span className="notes-status">
          {saveStatus === "saving" && "Saving..."}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Error saving"}
        </span>
      </div>
      <div className="notes-body">
        <textarea
          className="notes-textarea"
          placeholder="Add notes for today (e.g. took a 2 hr lunch break, worked on task X...)"
          value={note}
          onChange={(e) => handleNoteChange(e.target.value)}
        />
      </div>
    </div>
  );
}
