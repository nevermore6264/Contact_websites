// Web Worker để parse Excel file trong background thread
// Load XLSX library từ CDN
importScripts(
  "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js",
);

const NAME_COLUMN_INDEX = 1;
const UNIT_COLUMN_INDEX = 2;
const PROVINCE_COLUMN_INDEX = 3;

const normalizeKey = (value) => {
  if (!value) return "";
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const provinceMap = new Map(
  [
    // Sáp nhập theo Nghị quyết 202/2025/QH15 (hiệu lực 01/07/2025)
    ["ha giang", "Tuyên Quang"],
    ["tuyen quang", "Tuyên Quang"],
    ["yen bai", "Lào Cai"],
    ["lao cai", "Lào Cai"],
    ["bac kan", "Thái Nguyên"],
    ["thai nguyen", "Thái Nguyên"],
    ["vinh phuc", "Phú Thọ"],
    ["hoa binh", "Phú Thọ"],
    ["phu tho", "Phú Thọ"],
    ["bac giang", "Bắc Ninh"],
    ["bac ninh", "Bắc Ninh"],
    ["thai binh", "Hưng Yên"],
    ["hung yen", "Hưng Yên"],
    ["hai duong", "Thành phố Hải Phòng"],
    ["hai phong", "Thành phố Hải Phòng"],
    ["thanh pho hai phong", "Thành phố Hải Phòng"],
    ["tp hai phong", "Thành phố Hải Phòng"],
    ["tp. hai phong", "Thành phố Hải Phòng"],
    ["ha nam", "Ninh Bình"],
    ["nam dinh", "Ninh Bình"],
    ["ninh binh", "Ninh Bình"],
    ["quang binh", "Quảng Trị"],
    ["quang tri", "Quảng Trị"],
    ["quang nam", "Thành phố Đà Nẵng"],
    ["da nang", "Thành phố Đà Nẵng"],
    ["thanh pho da nang", "Thành phố Đà Nẵng"],
    ["tp da nang", "Thành phố Đà Nẵng"],
    ["tp. da nang", "Thành phố Đà Nẵng"],
    ["kon tum", "Quảng Ngãi"],
    ["quang ngai", "Quảng Ngãi"],
    ["binh dinh", "Gia Lai"],
    ["gia lai", "Gia Lai"],
    ["ninh thuan", "Khánh Hòa"],
    ["khanh hoa", "Khánh Hòa"],
    ["dak nong", "Lâm Đồng"],
    ["binh thuan", "Lâm Đồng"],
    ["lam dong", "Lâm Đồng"],
    ["phu yen", "Đắk Lắk"],
    ["dak lak", "Đắk Lắk"],
    ["ba ria-vung tau", "Thành phố Hồ Chí Minh"],
    ["ba ria - vung tau", "Thành phố Hồ Chí Minh"],
    ["ba ria vung tau", "Thành phố Hồ Chí Minh"],
    ["binh duong", "Thành phố Hồ Chí Minh"],
    ["thanh pho ho chi minh", "Thành phố Hồ Chí Minh"],
    ["tp ho chi minh", "Thành phố Hồ Chí Minh"],
    ["tp. ho chi minh", "Thành phố Hồ Chí Minh"],
    ["tp hcm", "Thành phố Hồ Chí Minh"],
    ["tp. hcm", "Thành phố Hồ Chí Minh"],
    ["hcm", "Thành phố Hồ Chí Minh"],
    ["binh phuoc", "Đồng Nai"],
    ["dong nai", "Đồng Nai"],
    ["long an", "Tây Ninh"],
    ["tay ninh", "Tây Ninh"],
    ["soc trang", "Thành phố Cần Thơ"],
    ["hau giang", "Thành phố Cần Thơ"],
    ["can tho", "Thành phố Cần Thơ"],
    ["thanh pho can tho", "Thành phố Cần Thơ"],
    ["tp can tho", "Thành phố Cần Thơ"],
    ["tp. can tho", "Thành phố Cần Thơ"],
    ["ben tre", "Vĩnh Long"],
    ["tra vinh", "Vĩnh Long"],
    ["vinh long", "Vĩnh Long"],
    ["tien giang", "Đồng Tháp"],
    ["dong thap", "Đồng Tháp"],
    ["bac lieu", "Cà Mau"],
    ["ca mau", "Cà Mau"],
    ["kien giang", "An Giang"],
    ["an giang", "An Giang"],
    // Không sáp nhập (giữ nguyên)
    ["cao bang", "Cao Bằng"],
    ["dien bien", "Điện Biên"],
    ["ha tinh", "Hà Tĩnh"],
    ["lai chau", "Lai Châu"],
    ["lang son", "Lạng Sơn"],
    ["nghe an", "Nghệ An"],
    ["quang ninh", "Quảng Ninh"],
    ["thanh hoa", "Thanh Hóa"],
    ["son la", "Sơn La"],
    ["ha noi", "Hà Nội"],
    ["tp ha noi", "Hà Nội"],
    ["tp. ha noi", "Hà Nội"],
    ["hue", "Thành phố Huế"],
    ["tp hue", "Thành phố Huế"],
    ["tp. hue", "Thành phố Huế"],
  ].map(([k, v]) => [normalizeKey(k), v]),
);

const stripProvincePrefix = (value) => {
  if (!value) return "";
  const raw = value.toString().trim();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.startsWith("tinh ")) {
    return raw
      .replace(/^tỉnh\s+/i, "")
      .replace(/^tinh\s+/i, "")
      .trim();
  }
  if (normalized.startsWith("thanh pho ")) {
    return raw
      .replace(/^thành phố\s+/i, "")
      .replace(/^thanh pho\s+/i, "")
      .trim();
  }
  return raw;
};

const toUpperCaseSafe = (value) => {
  if (!value) return "";
  return value.toString().toUpperCase();
};

const normalizeHyphenSpacing = (value) => {
  if (!value) return "";
  return value
    .toString()
    .replace(/\s*-\s*/g, "-")
    .trim();
};

const abbreviateUnit = (value) => {
  if (!value) return "";
  let text = value.toString().toUpperCase();

  const replaceVietnamese = (input, pattern, replacement) => {
    const normalized = input.normalize("NFD");
    const withoutMarks = normalized.replace(/[\u0300-\u036f]/g, "");
    const regex = new RegExp(pattern, "g");
    const plainMatches = withoutMarks.match(regex);
    if (!plainMatches) return input;

    let result = input;
    const plainRegex = new RegExp(pattern, "g");
    let match;
    let offset = 0;
    while ((match = plainRegex.exec(withoutMarks)) !== null) {
      const start = match.index - offset;
      const end = start + match[0].length;
      result = result.slice(0, start) + replacement + result.slice(end);
      offset += match[0].length - replacement.length;
    }
    return result;
  };

  text = replaceVietnamese(text, "\\bCONG AN\\b", "CA");
  text = replaceVietnamese(text, "\\bHUYEN\\b", "h");
  text = replaceVietnamese(text, "\\bTHANH PHO\\b", "tp");
  text = replaceVietnamese(text, "\\bTINH\\b", "t");
  text = replaceVietnamese(text, "\\bQUAN\\b", "q");
  text = replaceVietnamese(text, "\\bTHI XA\\b", "tx");
  text = replaceVietnamese(text, "\\bTHI TRAN\\b", "tt");
  text = replaceVietnamese(text, "\\bPHUONG\\b", "p");
  text = replaceVietnamese(text, "\\bXA\\b", "x");

  text = text.replace(/\s+/g, " ").trim();
  return text;
};

const formatUnit = (value) => {
  if (!value) return "";
  const abbreviations = new Set(["h", "tp", "t", "q", "tx", "tt", "p", "x"]);
  const normalized = normalizeHyphenSpacing(abbreviateUnit(value));

  return normalized
    .split(" ")
    .map((token) => {
      if (!token) return "";
      return token
        .split("-")
        .map((part) => {
          const lower = part.toLowerCase();
          if (abbreviations.has(lower)) return lower;
          return part.toUpperCase();
        })
        .join("-");
    })
    .filter(Boolean)
    .join(" ");
};

const getLastWord = (value) => {
  if (!value) return "";
  const parts = value.toString().trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
};

const splitNameUnit = (name, unit) => {
  let finalName = name || "";
  let finalUnit = unit || "";
  if (!finalName && finalUnit && finalUnit.includes("-")) {
    const parts = finalUnit.split("-").map((p) => p.trim());
    if (parts.length >= 2) {
      finalName = parts[0];
      finalUnit = parts.slice(1).join(" - ");
    }
  }
  return { finalName, finalUnit };
};

const buildSummary = (name, unit, province) => {
  const { finalName, finalUnit } = splitNameUnit(name, unit);
  const namePart = toUpperCaseSafe(getLastWord(finalName)).trim();
  const unitPart = formatUnit(finalUnit);
  const provincePart = toUpperCaseSafe(normalizeHyphenSpacing(province));
  if (!namePart) {
    return `${unitPart}-${provincePart}`;
  }
  return `${namePart}|${unitPart}-${provincePart}`;
};

const mapProvinceName = (value) => {
  if (!value) return "";
  const cleaned = stripProvincePrefix(value);
  const key = normalizeKey(cleaned);
  const fallbackKey = normalizeKey(value);
  const mapped =
    provinceMap.get(key) || provinceMap.get(fallbackKey) || cleaned;
  return toUpperCaseSafe(stripProvincePrefix(mapped));
};

self.onmessage = async function (e) {
  const { type, data } = e.data;

  if (type === "parse") {
    try {
      // Gửi progress
      self.postMessage({ type: "progress", progress: 10 });

      // Parse workbook
      const workbook = XLSX.read(data, {
        type: "array",
        cellDates: false,
        cellNF: false,
        cellStyles: false,
        dense: false,
      });

      self.postMessage({ type: "progress", progress: 50 });

      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[firstSheetName];

      // Parse sheet theo từng chunk dòng để không bị treo
      self.postMessage({ type: "progress", progress: 60 });

      const range = XLSX.utils.decode_range(firstSheet["!ref"] || "A1");
      const startRow = range.s.r;
      const endRow = range.e.r;
      const startCol = range.s.c;
      const endCol = range.e.c;

      // Đọc header (dòng đầu tiên)
      const headerRows = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        range: {
          s: { r: startRow, c: startCol },
          e: { r: startRow, c: endCol },
        },
        defval: null,
        raw: false,
      });

      if (!headerRows.length) {
        self.postMessage({
          type: "error",
          error: "File Excel không có dữ liệu.",
        });
        return;
      }

      const rawHeaders = headerRows[0].map((cell) =>
        cell === null || cell === undefined ? "" : String(cell),
      );

      const headers = rawHeaders.map((header) => toUpperCaseSafe(header));
      while (headers.length <= PROVINCE_COLUMN_INDEX) {
        headers.push("");
      }
      headers.splice(PROVINCE_COLUMN_INDEX + 1, 0, "TÊN TỈNH SAU SÁP NHẬP");
      headers.splice(PROVINCE_COLUMN_INDEX + 2, 0, "TÓM TẮT");

      // Gửi headers trước
      self.postMessage({
        type: "headers",
        headers,
      });

      self.postMessage({ type: "progress", progress: 70 });

      // Tổng số dòng dữ liệu (trừ header)
      const totalRows = Math.max(0, endRow - startRow);
      if (totalRows === 0) {
        self.postMessage({ type: "complete", progress: 100 });
        return;
      }

      // Gửi từng chunk nhỏ để hiển thị ngay
      const chunkSize = 50; // 50 dòng mỗi lần

      try {
        for (let r = startRow + 1; r <= endRow; r += chunkSize) {
          const rowEnd = Math.min(r + chunkSize - 1, endRow);
          const chunk = XLSX.utils.sheet_to_json(firstSheet, {
            header: 1,
            range: { s: { r, c: startCol }, e: { r: rowEnd, c: endCol } },
            defval: null,
            raw: false,
          });

          const mappedChunk = chunk.map((row) => {
            const rowCells = Array.isArray(row) ? [...row] : [];
            while (rowCells.length <= PROVINCE_COLUMN_INDEX) {
              rowCells.push("");
            }
            const nameRaw = rowCells[NAME_COLUMN_INDEX];
            const unitRaw = rowCells[UNIT_COLUMN_INDEX];
            const oldProvinceRaw = rowCells[PROVINCE_COLUMN_INDEX];
            const oldProvinceMapped = mapProvinceName(oldProvinceRaw);
            const oldProvince = toUpperCaseSafe(
              stripProvincePrefix(oldProvinceMapped),
            );
            const newProvince = toUpperCaseSafe(oldProvinceMapped);
            const summary = buildSummary(nameRaw, unitRaw, oldProvince);

            rowCells[PROVINCE_COLUMN_INDEX] = oldProvince;
            rowCells.splice(PROVINCE_COLUMN_INDEX + 1, 0, newProvince);
            rowCells.splice(PROVINCE_COLUMN_INDEX + 2, 0, summary);
            return rowCells;
          });

          const processed = r - (startRow + 1);
          const progress = 70 + Math.floor((processed / totalRows) * 29);

          self.postMessage({
            type: "chunk",
            rows: mappedChunk,
            progress: Math.min(progress, 99),
            currentIndex: processed,
            totalRows: totalRows,
          });

          // Delay nhỏ để không block
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        await new Promise((resolve) => setTimeout(resolve, 20));
        self.postMessage({ type: "complete", progress: 100 });
      } catch (chunkError) {
        console.error("Error sending chunks:", chunkError);
        self.postMessage({ type: "complete", progress: 100 });
      }
    } catch (error) {
      console.error("Worker error:", error);
      self.postMessage({
        type: "error",
        error: "Không đọc được file Excel. Vui lòng kiểm tra lại.",
      });
    }
  }
};
