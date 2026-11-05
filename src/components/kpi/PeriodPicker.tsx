"use client";

import { useMemo } from "react";
import { Calendar, ChevronDown, RotateCcw } from "lucide-react";
import { monthName, cn } from "@/lib/utils";

export type Period =
  | { type: "month"; year?: number; month?: number }
  | { type: "range"; start: string; end: string; year?: number; month?: number };

interface PeriodPickerProps {
  period: Period;
  onChange: (period: Period) => void;
  monthLabel?: string;
  maxDate?: string;
  className?: string;
}

export function PeriodPicker({ period, onChange, className }: PeriodPickerProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthValue = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const selectedYear =
    period.type === "month" && period.year ? period.year : currentYear;
  const selectedMonth =
    period.type === "month" && period.month ? period.month : currentMonth;
  const selectedValue = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

  const isCurrentMonth = selectedValue === currentMonthValue;

  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    // Tampilkan opsi bulan mulai dari 1 bulan ke depan hingga 26 bulan ke belakang
    const baseDate = new Date(currentYear, currentMonth, 1);
    for (let i = 0; i < 28; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const isCurrent = val === currentMonthValue;
      const label = `${monthName(d.getMonth() + 1)} ${d.getFullYear()}${isCurrent ? " (Bulan Ini)" : ""}`;
      options.push({ value: val, label });
    }
    if (!options.some((o) => o.value === selectedValue)) {
      options.unshift({
        value: selectedValue,
        label: `${monthName(selectedMonth)} ${selectedYear}`,
      });
    }
    return options;
  }, [currentMonth, currentMonthValue, currentYear, selectedMonth, selectedValue, selectedYear]);

  function handleChange(val: string) {
    const [y, m] = val.split("-").map(Number);
    onChange({ type: "month", year: y, month: m });
  }

  function handleReset() {
    onChange({ type: "month", year: currentYear, month: currentMonth });
  }

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <div className="relative inline-flex items-center">
        <Calendar className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <select
          value={selectedValue}
          onChange={(e) => handleChange(e.target.value)}
          className="h-9 pl-9 pr-8 rounded-lg border border-input bg-background text-xs sm:text-sm font-medium shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
          aria-label="Pilih Periode Bulan"
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>

      {!isCurrentMonth && (
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all shadow-sm"
          title="Kembali ke Bulan Berjalan"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Bulan Ini</span>
        </button>
      )}
    </div>
  );
}
