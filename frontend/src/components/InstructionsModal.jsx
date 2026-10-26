import { useEffect, useRef } from "react";

export default function InstructionsModal({ onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="instructions-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="instructions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instructions-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="instructions-header">
          <h2 id="instructions-title">Instructions</h2>
          <button
            ref={closeRef}
            type="button"
            className="instructions-close"
            onClick={onClose}
            aria-label="Close instructions"
          >
            ×
          </button>
        </div>

        <div className="instructions-body">
          <section>
            <h3>About the data</h3>
            <p>
              Explore immigration patterns in Massachusetts’ 26 Gateway Cities,
              alongside other cities and towns statewide. Use the dashboard to see:
            </p>
            <ul>
              <li>The size and change of the foreign-born population</li>
              <li>Residents’ countries and regions of origin</li>
              <li>
                Foreign-born income, education, and homeownership across places
              </li>
            </ul>
            <p>
              Data come from U.S. Census Bureau ACS 5-year estimates. The latest
              release covers 2020–2024; both trend tabs also include releases back to 2012.
              These are survey estimates, so small differences may fall within the
              margin of error.
            </p>
          </section>

          <section>
            <h3>Acknowledgements</h3>
            <p>
              The University of Massachusetts Donahue Institute served as a
              technical consultant on the usage of U.S. Census Bureau data for
              this dashboard.
            </p>
          </section>
        </div>

        <div className="instructions-footer">
          <button type="button" className="instructions-done" onClick={onClose}>
            Start exploring
          </button>
        </div>
      </div>
    </div>
  );
}
