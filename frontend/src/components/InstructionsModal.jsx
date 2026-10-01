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
              This dashboard uses U.S. Census Bureau American Community Survey
              (ACS) 5-year estimates for Massachusetts places. The figures shown
              for 2024 describe the 2020–2024 period. The Trends view also
              includes earlier 5-year releases, back to 2012.
            </p>
            <p>
              The focus is Massachusetts’ 26 Gateway Cities, compared with other
              cities and towns in the state and with the Massachusetts average.
              You can use it to see:
            </p>
            <ul>
              <li>How large the foreign-born population is, and how that share has changed</li>
              <li>Which countries and regions people came from</li>
              <li>
                How income, unemployment, poverty, education, and homeownership
                compare across places, including some measures for foreign-born residents
              </li>
            </ul>
            <p>
              These are survey estimates, not exact counts, so small differences
              can fall within the margin of error.
            </p>
          </section>

          <section>
            <h3>Using the city filter</h3>
            <p>
              The panel on the left, labeled Filter Cities, chooses which places
              the charts describe.
            </p>
            <ul>
              <li>
                A purple dot marks a Gateway City. A gray dot marks another
                Massachusetts municipality. The same dots appear beside each
                name in the search list.
              </li>
              <li>
                Click Gateway Cities to select all of them at once. Click it
                again to clear that selection. Click Other Municipalities to
                show only those places in the search list.
              </li>
              <li>
                Type in Search cities, then click a name to add it. Selected
                places appear as tags under the search box.
              </li>
              <li>Click × on a tag to remove that place, or Clear all to start over.</li>
              <li>
                With nothing selected, Overview shows Massachusetts statewide.
                City Metrics shows every place. On Trends, choose All Gateway
                Cities or All MA County Subdivisions until you have picked
                places for Selected.
              </li>
              <li>
                After you select places, Overview compares them, and City Metrics
                and Origins narrow to that list. On Trends, Selected uses the
                same list.
              </li>
              <li>
                On Origins, Search a country across cities uses that same
                selection. If Lowell is selected on Overview, a search for
                Cambodia shows only Lowell until you remove it or click Clear all.
              </li>
              <li>
                Show Gateway Only, on City Metrics and Origins, limits the chart
                to Gateway Cities.
              </li>
            </ul>
            <p>
              Download CSV saves the data for the tab you are currently viewing.
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
