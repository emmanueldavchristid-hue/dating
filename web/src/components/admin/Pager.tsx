import { IconChevronLeft, IconChevronRight } from "../icons";

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (pages <= 1) return <p className="subtle" style={{ marginTop: 12 }}>{total} élément{total > 1 ? "s" : ""}</p>;
  return (
    <nav className="row" style={{ justifyContent: "space-between", marginTop: 12 }} aria-label="Pagination">
      <span className="subtle">
        Page {page} / {pages} · {total} éléments
      </span>
      <span className="row">
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Page précédente">
          <IconChevronLeft />
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Page suivante">
          <IconChevronRight />
        </button>
      </span>
    </nav>
  );
}
