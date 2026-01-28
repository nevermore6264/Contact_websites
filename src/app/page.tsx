"use client";

import { useCallback, useMemo, useState } from "react";

type Row = (string | number | null)[];

type FilterOperator = "contains" | "equals" | "startsWith" | "endsWith";

type FilterCondition = {
  columnIndex: number;
  operator: FilterOperator;
  value: string;
};

const ROWS_PER_PAGE = 50; // Số dòng mỗi trang

export default function Home() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<FilterCondition[]>([
    { columnIndex: 0, operator: "contains", value: "" },
  ]);
  const [hiddenColumns, setHiddenColumns] = useState<number[]>([]);
  const [showColumnPanel, setShowColumnPanel] = useState(false);

  const resetToFirstPage = () => setCurrentPage(1);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      setIsParsing(true);
      setParseProgress(0);
      setFileName(file.name);
      setRows([]); // Reset rows
      setHeaders([]); // Reset headers
      setFilters([{ columnIndex: 0, operator: "contains", value: "" }]);
      setCurrentPage(1);
      setHiddenColumns([]);
      setShowColumnPanel(false);

      try {
        // Đọc file
        const data = await file.arrayBuffer();

        // Tạo Web Worker để parse file trong background thread
        const worker = new Worker("/excel-worker.js");

        let isComplete = false;

        // Lắng nghe messages từ worker
        worker.onmessage = (e) => {
          const {
            type,
            progress,
            headers,
            rows,
            error,
            currentIndex,
            totalRows,
          } = e.data;

          if (type === "progress") {
            setParseProgress(progress);
          } else if (type === "headers") {
            // Nhận headers và hiển thị ngay
            setHeaders(headers);
          } else if (type === "chunk") {
            // Nhận từng chunk và append vào rows ngay lập tức
            setRows((prevRows) => [...prevRows, ...rows]);
            setParseProgress(progress);

            // Kiểm tra nếu đã nhận hết chunks
            if (currentIndex !== undefined && totalRows !== undefined) {
              const isLastChunk = currentIndex + rows.length >= totalRows;
              if (isLastChunk && !isComplete) {
                // Đã nhận hết, đợi message complete hoặc tự động complete sau 500ms
                setTimeout(() => {
                  if (!isComplete) {
                    isComplete = true;
                    setParseProgress(100);
                    setIsParsing(false);
                    worker.terminate();
                  }
                }, 500);
              }
            }
          } else if (type === "complete") {
            // Hoàn thành
            isComplete = true;
            setParseProgress(100);
            setIsParsing(false);
            worker.terminate();
          } else if (type === "error") {
            isComplete = true;
            setError(error);
            setIsParsing(false);
            worker.terminate();
          }
        };

        worker.onerror = (error) => {
          console.error("Worker error:", error);
          setError("Lỗi khi xử lý file Excel. Vui lòng thử lại.");
          setIsParsing(false);
          worker.terminate();
        };

        // Gửi data đến worker để parse
        worker.postMessage({ type: "parse", data });
      } catch (err) {
        console.error(err);
        setError("Không đọc được file Excel. Vui lòng kiểm tra lại.");
        setIsParsing(false);
      }
    },
    [],
  );

  const activeFilters = useMemo(
    () => filters.filter((filter) => filter.value.trim() !== ""),
    [filters],
  );

  const normalizeValue = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const filteredRows = useMemo(() => {
    if (activeFilters.length === 0) return rows;

    return rows.filter((row) =>
      activeFilters.every((filter) => {
        const cell = row[filter.columnIndex];
        const cellText =
          cell === null || cell === undefined ? "" : String(cell);
        const normalizedCell = normalizeValue(cellText);
        const normalizedFilter = normalizeValue(filter.value.trim());

        switch (filter.operator) {
          case "equals":
            return normalizedCell === normalizedFilter;
          case "startsWith":
            return normalizedCell.startsWith(normalizedFilter);
          case "endsWith":
            return normalizedCell.endsWith(normalizedFilter);
          case "contains":
          default:
            return normalizedCell.includes(normalizedFilter);
        }
      }),
    );
  }, [rows, activeFilters]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE);
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const endIndex = startIndex + ROWS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      {
        columnIndex: Math.max(0, Math.min(headers.length - 1, 0)),
        operator: "contains",
        value: "",
      },
    ]);
    resetToFirstPage();
  };

  const updateFilter = (index: number, update: Partial<FilterCondition>) => {
    setFilters((prev) =>
      prev.map((filter, i) =>
        i === index ? { ...filter, ...update } : filter,
      ),
    );
    resetToFirstPage();
  };

  const removeFilter = (index: number) => {
    setFilters((prev) => {
      if (prev.length === 1) {
        return [{ ...prev[0], value: "" }];
      }
      return prev.filter((_, i) => i !== index);
    });
    resetToFirstPage();
  };

  const clearFilters = () => {
    setFilters([{ columnIndex: 0, operator: "contains", value: "" }]);
    resetToFirstPage();
  };

  const toggleColumn = (index: number) => {
    setHiddenColumns((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const visibleColumnIndices = useMemo(
    () => headers.map((_, i) => i).filter((i) => !hiddenColumns.includes(i)),
    [headers, hiddenColumns],
  );

  const exportXlsx = async () => {
    if (!headers.length) return;
    const columns = visibleColumnIndices;
    const headerRow = columns.map((i) => headers[i] || `Cột ${i + 1}`);

    const rowsToExport = filteredRows.map((row) =>
      columns.map((i) => (row[i] ?? "").toString()),
    );

    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...rowsToExport]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts");
    XLSX.writeFile(workbook, `contacts_export_${Date.now()}.xlsx`, {
      bookType: "xlsx",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      {/* Decorative background elements */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-gradient-to-br from-blue-200/30 to-purple-200/30 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-200/30 to-pink-200/30 blur-3xl"></div>
      </div>

      <main className="mx-auto flex min-h-screen w-[90vw] max-w-[90vw] flex-col gap-8 px-4 py-12 pb-20 sm:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              {/* Logo */}
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-1 shadow-2xl shadow-blue-500/40 ring-4 ring-white/50">
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white">
                  <svg
                    className="h-10 w-10"
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <defs>
                      <linearGradient
                        id="logoGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="#3B82F6" />
                        <stop offset="50%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#EC4899" />
                      </linearGradient>
                    </defs>
                    {/* Excel icon với gradient */}
                    <rect
                      x="20"
                      y="15"
                      width="60"
                      height="70"
                      rx="4"
                      fill="url(#logoGradient)"
                      opacity="0.1"
                    />
                    <path
                      d="M30 35 L50 35 M30 45 L50 45 M30 55 L50 55 M30 65 L50 65"
                      stroke="url(#logoGradient)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <path
                      d="M55 35 L75 35 M55 45 L75 45 M55 55 L75 55 M55 65 L75 65"
                      stroke="url(#logoGradient)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <circle cx="50" cy="25" r="3" fill="url(#logoGradient)" />
                    <path
                      d="M25 20 L75 20 L75 80 L25 80 Z"
                      stroke="url(#logoGradient)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </div>
                {/* Glow effect */}
                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 opacity-20 blur-xl"></div>
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-slate-900 via-blue-800 to-purple-800 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
                  Danh bạ từ Excel
                </h1>
                <p className="mt-2 text-sm text-slate-600 sm:text-base">
                  Tải file Excel từ máy cá nhân và xem dữ liệu trong bảng với
                  phân trang và lọc thông minh
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnPanel((prev) => !prev)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <svg
                  className="h-4 w-4 text-slate-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
                Cột
              </button>

              {showColumnPanel && (
                <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                  <p className="mb-2 text-xs font-semibold text-slate-600">
                    Hiển thị cột
                  </p>
                  <div className="flex max-h-56 flex-col gap-2 overflow-auto">
                    {headers.map((header, index) => (
                      <label
                        key={index}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <span className="truncate">
                          {header || `Cột ${index + 1}`}
                        </span>
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.includes(index)}
                          onChange={() => toggleColumn(index)}
                          className="h-4 w-4 accent-blue-600"
                        />
                      </label>
                    ))}
                    {headers.length === 0 && (
                      <span className="text-xs text-slate-400">
                        Chưa có dữ liệu
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={exportXlsx}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <svg
                className="h-4 w-4 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16"
                />
              </svg>
              Xuất XLSX
            </button>

            <label className="group relative inline-flex cursor-pointer items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 opacity-0 transition-opacity group-hover:opacity-100"></div>
              {isParsing ? (
                <>
                  <svg
                    className="h-5 w-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="relative">Đang xử lý...</span>
                </>
              ) : (
                <>
                  <svg
                    className="h-5 w-5 relative"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span className="relative">Chọn file Excel</span>
                </>
              )}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
                disabled={isParsing}
              />
            </label>
          </div>
        </header>

        <section className="flex flex-col gap-6 rounded-3xl bg-white/90 p-6 shadow-xl shadow-slate-200/50 ring-1 ring-slate-200/50 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-purple-100">
                <svg
                  className="h-5 w-5 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Thông tin file
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    {fileName ? (
                      <>
                        <svg
                          className="h-4 w-4 text-green-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="text-sm font-medium text-slate-900">
                          {fileName}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-slate-500">
                        Chưa chọn file
                      </span>
                    )}
                  </div>
                </div>
                {rows.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1">
                      <svg
                        className="h-3.5 w-3.5 text-blue-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                      <span className="font-semibold text-blue-700">
                        {rows.length.toLocaleString("vi-VN")} dòng
                      </span>
                    </div>
                    {activeFilters.length > 0 &&
                      filteredRows.length !== rows.length && (
                        <div className="flex items-center gap-1.5 rounded-lg bg-purple-50 px-2.5 py-1">
                          <svg
                            className="h-3.5 w-3.5 text-purple-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                          </svg>
                          <span className="font-semibold text-purple-700">
                            {filteredRows.length.toLocaleString("vi-VN")} kết
                            quả
                          </span>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white/90 p-2 shadow-sm sm:w-[460px]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <svg
                      className="h-4 w-4 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Bộ lọc nâng cao
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Chọn nhiều điều kiện để tìm kiếm
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Xoá lọc
                  </button>
                  <button
                    type="button"
                    onClick={addFilter}
                    className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-700"
                  >
                    Thêm điều kiện
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {filters.map((filterItem, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2 sm:grid-cols-[minmax(120px,1.2fr)_minmax(90px,1fr)_minmax(140px,1.4fr)_30px]"
                  >
                    <select
                      value={filterItem.columnIndex}
                      onChange={(e) =>
                        updateFilter(index, {
                          columnIndex: Number(e.target.value),
                        })
                      }
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                    >
                      {headers.length === 0 && (
                        <option value={0}>Chọn cột...</option>
                      )}
                      {headers.map((header, headerIndex) => (
                        <option key={headerIndex} value={headerIndex}>
                          {header || `Cột ${headerIndex + 1}`}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filterItem.operator}
                      onChange={(e) =>
                        updateFilter(index, {
                          operator: e.target.value as FilterOperator,
                        })
                      }
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                    >
                      <option value="contains">Chứa</option>
                      <option value="equals">Bằng</option>
                      <option value="startsWith">Bắt đầu</option>
                      <option value="endsWith">Kết thúc</option>
                    </select>

                    <input
                      type="text"
                      value={filterItem.value}
                      onChange={(e) =>
                        updateFilter(index, { value: e.target.value })
                      }
                      placeholder="Nhập giá trị..."
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                    />

                    <button
                      type="button"
                      onClick={() => removeFilter(index)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      aria-label="Xoá điều kiện"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {isParsing && (
            <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-blue-50 to-purple-50 p-5 ring-2 ring-blue-100/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
                    <svg
                      className="h-5 w-5 animate-spin text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">
                      Đang xử lý file...
                    </span>
                    <p className="text-xs text-slate-600">
                      Vui lòng đợi trong giây lát
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-sm">
                  <span className="text-lg font-bold text-blue-600">
                    {parseProgress}
                  </span>
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/80 shadow-inner">
                <div
                  className="absolute inset-y-0 left-0 flex items-center justify-end pr-2 bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500 ease-out shadow-lg"
                  style={{ width: `${parseProgress}%` }}
                >
                  {parseProgress > 10 && (
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white"></div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-red-50 to-pink-50 p-4 ring-2 ring-red-100/50">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                <svg
                  className="h-5 w-5 text-red-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="font-medium text-red-800">{error}</p>
            </div>
          )}

          <div className="mt-2 overflow-hidden rounded-2xl border-2 border-slate-200/50 bg-white shadow-lg">
            <div className="max-h-[600px] overflow-auto">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-gradient-to-r from-slate-50 to-slate-100/80 backdrop-blur-sm">
                  <tr className="border-b-2 border-slate-200">
                    {visibleColumnIndices.map((index) => (
                      <th
                        key={index}
                        className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-700 first:pl-6 last:pr-6"
                      >
                        <div className="flex items-center gap-2">
                          <span>{headers[index] || `Cột ${index + 1}`}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.length === 0 && headers.length > 0 && (
                    <tr>
                      <td
                        colSpan={visibleColumnIndices.length}
                        className="px-6 py-12 text-center"
                      >
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                            <svg
                              className="h-8 w-8 text-slate-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {rows.length === 0
                                ? "Chưa có dữ liệu"
                                : "Không tìm thấy kết quả"}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {rows.length === 0
                                ? "Hãy tải lên một file Excel để bắt đầu"
                                : "Thử thay đổi từ khóa tìm kiếm"}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {paginatedRows.map((row, idx) => {
                    const actualIndex = startIndex + idx;
                    return (
                      <tr
                        key={actualIndex}
                        className="transition-colors hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-purple-50/50"
                      >
                        {visibleColumnIndices.map((cellIndex) => (
                          <td
                            key={cellIndex}
                            className="whitespace-nowrap px-4 py-3.5 text-sm text-slate-700 first:pl-6 last:pr-6"
                          >
                            <span className="font-medium">
                              {row[cellIndex] !== null &&
                              row[cellIndex] !== undefined
                                ? String(row[cellIndex])
                                : ""}
                            </span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredRows.length > 0 && totalPages > 1 && (
              <div className="flex flex-col gap-4 border-t-2 border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span>Hiển thị</span>
                  <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-semibold text-blue-700">
                    {startIndex + 1}
                  </span>
                  <span>đến</span>
                  <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-semibold text-blue-700">
                    {Math.min(endIndex, filteredRows.length)}
                  </span>
                  <span>trong tổng số</span>
                  <span className="rounded-lg bg-purple-100 px-2.5 py-1 font-semibold text-purple-700">
                    {filteredRows.length.toLocaleString("vi-VN")}
                  </span>
                  <span>dòng</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Trước
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                            currentPage === pageNum
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30"
                              : "border-2 border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-700"
                  >
                    Sau
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <footer className="fixed bottom-0 left-0 right-0 z-40 w-full bg-white/90 px-6 py-2 text-center text-sm text-slate-600 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200/60 backdrop-blur">
          Được phát triển bởi Trần Trung Hiếu · 0862478150
        </footer>
      </main>
    </div>
  );
}
