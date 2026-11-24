"use client";

import { useMemo } from "react";
import { SkipBack, SkipForward } from "lucide-react";

// Page buttons to render: the first and last page plus a window around the current one.
function buildPageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const items: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("gap");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("gap");
  items.push(total);
  return items;
}

type HistoryPaginationProps = {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onChange: (page: number) => void;
};

export function HistoryPagination({ currentPage, totalItems, pageSize, onChange }: HistoryPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pageItems = useMemo(() => buildPageItems(currentPage, totalPages), [currentPage, totalPages]);
  const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <nav className="history-footer" aria-label="Navigasi halaman riwayat">
      <p className="history-count">Menampilkan {firstItem}–{lastItem} dari {totalItems} aktivitas</p>
      <div className="pagination">
        {currentPage > 1 && (
          <button type="button" aria-label="Halaman pertama" onClick={() => onChange(1)}>
            <SkipBack size={16} />
          </button>
        )}
        {pageItems.map((item, index) =>
          item === "gap" ? (
            <span className="pagination-gap" aria-hidden="true" key={`gap-${index}`}>…</span>
          ) : (
            <button
              type="button"
              key={item}
              className={item === currentPage ? "active" : undefined}
              aria-current={item === currentPage ? "page" : undefined}
              onClick={() => onChange(item)}
            >
              {item}
            </button>
          ),
        )}
        {currentPage < totalPages && (
          <button type="button" aria-label="Halaman terakhir" onClick={() => onChange(totalPages)}>
            <SkipForward size={16} />
          </button>
        )}
      </div>
    </nav>
  );
}
