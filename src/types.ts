export interface TyreRecord {
  rowId: number; // Row index in Google Sheets to potentially identify the row
  date: string; // "YYYY-MM-DD" or similar format
  invoiceNo: string;
  brand: string;
  pattern: string;
  dot: string; // "WWYY" e.g., "1225"
  quantity: number;
}

export interface DoTQty {
  dot: string; // "WWYY"
  quantity: number;
}

export interface GroupedTyre {
  id: string; // e.g., `${brand}_${pattern}` or combined with invoice
  brand: string;
  pattern: string;
  invoiceNo: string;
  date: string;
  dots: {
    dot: string;
    quantity: number;
    isOld: boolean;
    ageYears: number;
  }[];
  totalQuantity: number;
  isLowStock: boolean;
  hasOldStock: boolean;
}

export interface SheetConfig {
  spreadsheetId: string | null;
  spreadsheetName: string | null;
  spreadsheetUrl: string | null;
}
