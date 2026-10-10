import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { deleteTutorFiles } from "../state/fileStore";
import { lastStudiedLabel, lookOf, useLibrary } from "../state/library";
import { CardCharacter, HomeCanvas } from "./HomeScene";
import styles from "./HomePage.module.css";

// "/": design/Tutor Home.dc.html.

function greeting() {
  const h = new Date().getHours();
  return h < 12
    ? "Good morning."
    : h < 18
      ? "Good afternoon."
      : "Good evening.";
}

const isField = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

export function HomePage() {
  const tutors = useLibrary((s) => s.tutors);
  const removeTutor = useLibrary((s) => s.removeTutor);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // tutor id awaiting delete confirmation
  const search = useRef<HTMLInputElement>(null);

  const deleteTutor = (id: string) => {
    removeTutor(id);
    void deleteTutorFiles(id);
    setConfirming(null);
  };

  // "/" jumps to search; Esc cancels a pending delete.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(null);
      if (
        e.key !== "/" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isField(e.target)
      )
        return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const list = tutors.filter((t) => !q || t.name.toLowerCase().includes(q));
  const leave = (id: string) => setHover((h) => (h === id ? null : h));

  return (
    <div className={styles.page} data-screen-label="Home">
      <div className={styles.wrap}>
        <div className={styles.topBar}>
          <div className={styles.logo}>
            <div className={styles.logoDot} />
            Tutor
          </div>
          <div className={styles.searchRow}>
            <div className={styles.search}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  cx="10.5"
                  cy="10.5"
                  r="6.5"
                  fill="none"
                  stroke="#8a857d"
                  strokeWidth="2.2"
                />
                <path
                  d="M15.5 15.5L20 20"
                  stroke="#8a857d"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={search}
                className={styles.searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Escape" && (setQuery(""), e.currentTarget.blur())
                }
                placeholder="Search tutors and notes"
                aria-label="Search tutors"
              />
              <div className={styles.kbd}>/</div>
            </div>
          </div>
          <div className={styles.avatar}>AK</div>
        </div>

        <div className={styles.hello}>
          {greeting()}{" "}
          <span className={styles.helloSoft}>What are we studying?</span>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>Your tutors</div>
            <div className={styles.count}>
              {tutors.length} tutor{tutors.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className={styles.grid}>
            <Link
              to="/new"
              className={styles.card}
              data-dashed="true"
              data-hover={hover === "new"}
              onMouseEnter={() => setHover("new")}
              onMouseLeave={() => leave("new")}
            >
              <div className={styles.art} data-variant="new">
                <CardCharacter className={styles.view} awake offsetY={0.2} />
              </div>
              <div className={styles.body} data-gap="tight">
                <div className={styles.newTitle}>
                  <div className={styles.plus}>+</div>
                  New tutor
                </div>
                <div className={styles.newDesc}>
                  Upload your notes and get a tutor that teaches them.
                </div>
              </div>
            </Link>

            {list.map((t) => {
              const on = hover === t.id;
              const total = t.outline.length;
              const done = Math.min(t.sectionsDone, total);
              const complete = done >= total;
              const asking = confirming === t.id;
              return (
                <div
                  key={t.id}
                  className={styles.cardWrap}
                  data-hover={on && !asking}
                  onMouseEnter={() => setHover(t.id)}
                  onMouseLeave={() => leave(t.id)}
                >
                  <Link
                    to={`/tutor/${t.id}`}
                    className={styles.card}
                    data-hover={on && !asking}
                    tabIndex={asking ? -1 : undefined}
                  >
                    <div className={styles.art}>
                      <div className={styles.floor} />
                      {/* Hidden while the delete confirm covers the art (the canvas draws above the cards). */}
                      {!asking && (
                        <CardCharacter
                          className={styles.view}
                          awake={on}
                          look={lookOf(t)}
                        />
                      )}
                      {!on && !asking && (
                        <div className={styles.zs} aria-hidden="true">
                          <span className={styles.z} data-z="1">
                            z
                          </span>
                          <span className={styles.z} data-z="2">
                            z
                          </span>
                        </div>
                      )}
                      {complete && (
                        <div className={styles.badge}>✓ Complete</div>
                      )}
                    </div>
                    <div className={styles.body}>
                      <div className={styles.titleBlock}>
                        <div className={styles.name}>{t.name}</div>
                        <div className={styles.files}>
                          {t.files.length} file{t.files.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className={styles.progressBlock}>
                        <div className={styles.track}>
                          <div
                            className={styles.bar}
                            style={{
                              width: `${Math.round((done / total) * 100)}%`,
                            }}
                          />
                        </div>
                        <div className={styles.meta}>
                          <span className={styles.progress}>
                            {complete
                              ? `All ${total} sections`
                              : `${done} of ${total} sections`}
                          </span>
                          <span className={styles.last}>
                            {lastStudiedLabel(t.lastStudied)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                  {asking ? (
                    <div
                      className={styles.confirm}
                      role="alertdialog"
                      aria-label={`Delete ${t.name}?`}
                    >
                      <div className={styles.confirmTitle}>
                        Delete this tutor?
                      </div>
                      <div className={styles.confirmText}>
                        {t.name} and its {t.files.length} file
                        {t.files.length === 1 ? "" : "s"} will be removed. This
                        can't be undone.
                      </div>
                      <div className={styles.confirmActions}>
                        <button
                          type="button"
                          className={styles.cancel}
                          onClick={() => setConfirming(null)}
                          autoFocus
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={styles.deleteConfirm}
                          onClick={() => deleteTutor(t.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.delete}
                      aria-label={`Delete ${t.name}`}
                      title="Delete tutor"
                      onClick={() => setConfirming(t.id)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {list.length === 0 && (
            <div className={styles.empty}>No tutors match “{query}”.</div>
          )}
        </div>
      </div>
      <HomeCanvas className={styles.canvas} />
    </div>
  );
}
