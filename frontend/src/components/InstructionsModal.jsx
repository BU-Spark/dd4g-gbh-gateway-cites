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
              release covers 2020–2024; Trends also includes releases back to 2012.
              These are survey estimates, so small differences may fall within the
              margin of error.
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
                Click Gateway Cities to limit every chart to those places.
                Click Other Municipalities to limit every chart to the other
                Massachusetts municipalities. Click the active button again to
                clear that filter. The search list follows the same choice.
              </li>
              <li>
                Type in Search cities, then click a name to add it. Selected
                places appear as tags under the search box.
              </li>
              <li>Click × on a tag to remove that place, or Clear all to start over.</li>
              <li>
                With no filter and nothing selected, Overview shows Massachusetts
                statewide and City Metrics shows every place. Turning on Gateway
                Cities or Other Municipalities changes Overview, City Metrics,
                Origins, and Trends.
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
