import { TyreRecord } from '../types';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

// Search user's drive for an existing "Tyre Billed Stock Tracker" sheet
export async function findTrackerSpreadsheet(accessToken: string): Promise<{ id: string; name: string; webViewLink?: string } | null> {
  const query = encodeURIComponent("mimeType = 'application/vnd.google-apps.spreadsheet' and name = 'Tyre Billed Stock Tracker' and trashed = false");
  const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,webViewLink)`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to search Drive:', errorBody);
    throw new Error('Could not search Google Drive. Please ensure you have authorized Drive access.');
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return {
      id: data.files[0].id,
      name: data.files[0].name,
      webViewLink: data.files[0].webViewLink,
    };
  }
  return null;
}

// Create a new spreadsheet with default sheet and return its metadata
export async function createTrackerSpreadsheet(accessToken: string): Promise<{ id: string; name: string; webViewLink?: string }> {
  const url = `${SHEETS_API_BASE}`;
  
  const body = {
    properties: {
      title: 'Tyre Billed Stock Tracker',
    },
    sheets: [
      {
        properties: {
          title: 'Sheet1',
          gridProperties: {
            frozenRowCount: 1,
          },
        },
      },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Failed to create spreadsheet:', err);
    throw new Error('Failed to create a new Google Sheet. Please check your permissions.');
  }

  const data = await response.json();
  const spreadsheetId = data.spreadsheetId;
  const webViewLink = data.spreadsheetUrl;

  // Initialize the sheet with headers
  await initializeSpreadsheetHeaders(accessToken, spreadsheetId);

  return {
    id: spreadsheetId,
    name: 'Tyre Billed Stock Tracker',
    webViewLink,
  };
}

// Write the primary header row to the newly created spreadsheet
async function initializeSpreadsheetHeaders(accessToken: string, spreadsheetId: string): Promise<void> {
  const headers = [['Date', 'Invoice No', 'Brand', 'Pattern', 'DoT', 'Quantity']];
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/Sheet1!A1:F1?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: headers }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Failed to write headers:', err);
    throw new Error('Failed to configure Google Sheet headers.');
  }
}

// Fetch all Tyre entries from the sheet
export async function fetchTyreRecords(accessToken: string, spreadsheetId: string): Promise<TyreRecord[]> {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/Sheet1!A2:F?valueRenderOption=FORMATTED_VALUE`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Failed to fetch tyre records:', err);
    throw new Error('Could not read tyre data from your Google Sheet.');
  }

  const data = await response.json();
  const rows = data.values || [];

  const records: TyreRecord[] = [];
  
  rows.forEach((row: any[], index: number) => {
    // Spreadsheet rows are 1-indexed, headers are row 1.
    // So row data at index 0 in `rows` corresponds to spreadsheet Row 2.
    const rowId = index + 2; 

    // Extract columns beautifully, handling empty fields
    const date = row[0] || '';
    const invoiceNo = row[1] || '';
    const brand = row[2] || '';
    const pattern = row[3] || '';
    const dot = row[4] || '';
    const quantity = parseInt(row[5], 10) || 0;

    // Check if we have at least a minimal valid row (e.g. brand + pattern)
    if (brand || pattern || invoiceNo || dot) {
      records.push({
        rowId,
        date,
        invoiceNo,
        brand,
        pattern,
        dot,
        quantity,
      });
    }
  });

  return records;
}

// Append new tyre records (handles multiple DoTs) to Google Sheets
export async function appendTyreRecords(
  accessToken: string,
  spreadsheetId: string,
  records: Omit<TyreRecord, 'rowId'>[]
): Promise<void> {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/Sheet1!A:F:append?valueInputOption=USER_ENTERED`;

  const valuesPayload = records.map((rec) => [
    rec.date,
    rec.invoiceNo,
    rec.brand,
    rec.pattern,
    rec.dot,
    rec.quantity.toString(),
  ]);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: valuesPayload }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Failed to append records:', err);
    throw new Error('Failed to write new stock details to Google Sheets.');
  }
}

// Rewrite entire data rows to clear or delete specified records
export async function updateAllTyreRecords(
  accessToken: string,
  spreadsheetId: string,
  allRemainingRecords: Omit<TyreRecord, 'rowId'>[]
): Promise<void> {
  // Clear the existing rows in sheet (e.g., from row 2 downwards)
  const clearUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/Sheet1!A2:F:clear`;
  const clearResponse = await fetch(clearUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!clearResponse.ok) {
    const err = await clearResponse.text();
    console.error('Failed to clear records before update:', err);
    throw new Error('Failed to prepare document for modification.');
  }

  // If there are remaining records to write, output them
  if (allRemainingRecords.length > 0) {
    const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/Sheet1!A2:F?valueInputOption=USER_ENTERED`;
    const valuesPayload = allRemainingRecords.map((rec) => [
      rec.date,
      rec.invoiceNo,
      rec.brand,
      rec.pattern,
      rec.dot,
      rec.quantity.toString(),
    ]);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: valuesPayload }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Failed to rewrite records:', err);
      throw new Error('Failed to update stock modifications to Google Sheet.');
    }
  }
}
