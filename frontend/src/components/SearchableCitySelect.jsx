import { useEffect, useMemo, useRef, useState } from "react";

export default function SearchableCitySelect({
  options = [],
  value,
  onChange,
  placeholder = "Search city...",
  labelKey = "city",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  const selectedLabel =
    typeof value === "string"
      ? value
      : value?.[labelKey] || "";

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) =>
      String(typeof opt === "string" ? opt : opt[labelKey])
        .toLowerCase()
        .includes(q)
    );
  }, [options, query, labelKey]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (option) => {
    onChange(option);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "100%",
          background: "#ffffff",
          color: "#373737",
          border: "1px solid #c2c2c2",
          borderRadius: "10px",
          padding: "12px 14px",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {selectedLabel || "Select a city"}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width: "100%",
            background: "#ffffff",
            border: "1px solid #c2c2c2",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(54,18,71,0.12)",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px" }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #c2c2c2",
                background: "#ffffff",
                color: "#373737",
                outline: "none",
              }}
            />
          </div>

          <div
            style={{
              maxHeight: "260px",
              overflowY: "auto",
              padding: "6px",
            }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, idx) => {
                const label =
                  typeof option === "string" ? option : option[labelKey];
                const isSelected = label === selectedLabel;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelect(option)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderRadius: "8px",
                      background: isSelected ? "#732487" : "transparent",
                      color: isSelected ? "#fff" : "#373737",
                      cursor: "pointer",
                      marginBottom: "4px",
                    }}
                  >
                    {label}
                  </button>
                );
              })
            ) : (
              <div
                style={{
                  padding: "10px 12px",
                  color: "#6f6f6f",
                }}
              >
                No matching cities
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}