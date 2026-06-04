import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { TyreRecord, SheetConfig, GroupedTyre } from './types';
import { initAuth, googleSignIn, logout, setAccessToken } from './lib/firebase';
import {
  findTrackerSpreadsheet,
  createTrackerSpreadsheet,
  fetchTyreRecords,
  appendTyreRecords,
  updateAllTyreRecords,
} from './lib/googleSheets';
import { SheetsConfig } from './components/SheetsConfig';
import { TyreForm } from './components/TyreForm';
import { TyreList } from './components/TyreList';
import { Activity, ShieldCheck, Database, Layers, CheckCircle } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setToken] = useState<string | null>(null);
  const [authStateLoaded, setAuthStateLoaded] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Sheets backend details
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>({
    spreadsheetId: null,
    spreadsheetName: null,
    spreadsheetUrl: null,
  });

  // Data records from sheets
  const [records, setRecords] = useState<TyreRecord[]>([]);

  // Editing active tyre group
  const [editingGroup, setEditingGroup] = useState<GroupedTyre | null>(null);

  // Editing active single record row
  const [editingRecord, setEditingRecord] = useState<TyreRecord | null>(null);

  // Page Load / Loading State Indicators
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // 1. Listen to Authentication State changes
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setToken(token);
        setAccessToken(token);
        setAuthStateLoaded(true);
      },
      () => {
        setUser(null);
        setToken(null);
        setAccessToken(null);
        setAuthStateLoaded(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Locate or create spreadsheet when user aligns
  useEffect(() => {
    if (user && accessToken) {
      syncDatabaseAndRecords();
    } else {
      setRecords([]);
      setSheetConfig({ spreadsheetId: null, spreadsheetName: null, spreadsheetUrl: null });
    }
  }, [user, accessToken]);

  // Combined Sync operation
  const syncDatabaseAndRecords = async () => {
    if (!accessToken) return;
    setIsSyncing(true);
    setGlobalError(null);

    try {
      // Find tracker sheet
      let sheetMeta = await findTrackerSpreadsheet(accessToken);

      // Create stock sheet if missing
      if (!sheetMeta) {
        sheetMeta = await createTrackerSpreadsheet(accessToken);
      }

      setSheetConfig({
        spreadsheetId: sheetMeta.id,
        spreadsheetName: sheetMeta.name,
        spreadsheetUrl: sheetMeta.webViewLink || null,
      });

      // Load rows
      const dataRows = await fetchTyreRecords(accessToken, sheetMeta.id);
      setRecords(dataRows);
    } catch (err: any) {
      console.error(err);
      setGlobalError(err.message || 'Unable to load stock details. Please synchronize again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setGlobalError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setAccessToken(result.accessToken);
      }
    } catch (err: any) {
      setGlobalError('Authorization cancelled or failed. Please refresh or retry.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setGlobalError(null);
    try {
      await logout();
      setUser(null);
      setToken(null);
      setAccessToken(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Add new recorded tyre slots to Google Sheets
  const handleSaveRecords = async (newRows: Omit<TyreRecord, 'rowId'>[]) => {
    if (!accessToken || !sheetConfig.spreadsheetId) {
      throw new Error('No active database connected');
    }

    setIsSaving(true);
    setGlobalError(null);
    try {
      await appendTyreRecords(accessToken, sheetConfig.spreadsheetId, newRows);
      
      // Auto refresher
      const refreshedData = await fetchTyreRecords(accessToken, sheetConfig.spreadsheetId);
      setRecords(refreshedData);
    } catch (err: any) {
      setGlobalError(err.message || 'Failure writing records to sheet.');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Update edited records on Google Sheet & update local states
  const handleUpdateRecords = async (
    oldInvoiceNo: string,
    oldBrand: string,
    oldPattern: string,
    updatedRows: Omit<TyreRecord, 'rowId'>[]
  ) => {
    if (!accessToken || !sheetConfig.spreadsheetId) return;

    setIsSaving(true);
    setGlobalError(null);

    try {
      // Keep only rows that do not match the old entry parameters
      const remainingRows = records
        .filter((r) => {
          const matchInvoice = r.invoiceNo.trim().toUpperCase() === oldInvoiceNo.trim().toUpperCase();
          const matchBrand = r.brand.trim().toLowerCase() === oldBrand.trim().toLowerCase();
          const matchPattern = r.pattern.trim().toLowerCase() === oldPattern.trim().toLowerCase();
          return !(matchInvoice && matchBrand && matchPattern);
        })
        .map((r) => ({
          date: r.date,
          invoiceNo: r.invoiceNo,
          brand: r.brand,
          pattern: r.pattern,
          dot: r.dot,
          quantity: r.quantity,
        }));

      // Combine with new rows
      const allNewRows = [...remainingRows, ...updatedRows];

      await updateAllTyreRecords(accessToken, sheetConfig.spreadsheetId, allNewRows);

      // Auto update state
      const refreshedData = await fetchTyreRecords(accessToken, sheetConfig.spreadsheetId);
      setRecords(refreshedData);
      setEditingGroup(null);
    } catch (err: any) {
      setGlobalError(err.message || 'Error occurred while updating rows on spreadsheet.');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Update a single specific row record on Google Sheet & update local states
  const handleUpdateSingleRecord = async (
    rowId: number,
    updatedRecord: Omit<TyreRecord, 'rowId'>
  ) => {
    if (!accessToken || !sheetConfig.spreadsheetId) return;

    setIsSaving(true);
    setGlobalError(null);

    try {
      // Map all existing records and replace the one matching rowId
      const allRows = records.map((r) => {
        if (r.rowId === rowId) {
          return {
            date: updatedRecord.date,
            invoiceNo: updatedRecord.invoiceNo,
            brand: updatedRecord.brand,
            pattern: updatedRecord.pattern,
            dot: updatedRecord.dot,
            quantity: updatedRecord.quantity,
          };
        }
        return {
          date: r.date,
          invoiceNo: r.invoiceNo,
          brand: r.brand,
          pattern: r.pattern,
          dot: r.dot,
          quantity: r.quantity,
        };
      });

      await updateAllTyreRecords(accessToken, sheetConfig.spreadsheetId, allRows);

      // Auto update state
      const refreshedData = await fetchTyreRecords(accessToken, sheetConfig.spreadsheetId);
      setRecords(refreshedData);
      setEditingRecord(null);
    } catch (err: any) {
      setGlobalError(err.message || 'Error occurred while updating the row record on spreadsheet.');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Delete matching entries from the spreadsheet (corresponds to an entire Invoice row group)
  const handleDeleteGroup = async (invoiceNo: string, brand: string, pattern: string) => {
    if (!accessToken || !sheetConfig.spreadsheetId) return;

    setIsDeleting(true);
    setGlobalError(null);

    try {
      // Keep only rows that do not match the entry coordinates (brand, pattern, invoice)
      const remainingRows = records
        .filter((r) => {
          const matchInvoice = r.invoiceNo.trim().toUpperCase() === invoiceNo.trim().toUpperCase();
          const matchBrand = r.brand.trim().toLowerCase() === brand.trim().toLowerCase();
          const matchPattern = r.pattern.trim().toLowerCase() === pattern.trim().toLowerCase();
          return !(matchInvoice && matchBrand && matchPattern);
        })
        .map((r) => ({
          date: r.date,
          invoiceNo: r.invoiceNo,
          brand: r.brand,
          pattern: r.pattern,
          dot: r.dot,
          quantity: r.quantity,
        }));

      await updateAllTyreRecords(accessToken, sheetConfig.spreadsheetId, remainingRows);

      // Trigger re-load
      const refreshedData = await fetchTyreRecords(accessToken, sheetConfig.spreadsheetId);
      setRecords(refreshedData);
    } catch (err: any) {
      setGlobalError(err.message || 'Error occurred while updating rows on spreadsheet.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete a single row by its spreadsheet rowId
  const handleDeleteRow = async (rowId: number) => {
    if (!accessToken || !sheetConfig.spreadsheetId) return;

    setIsDeleting(true);
    setGlobalError(null);

    try {
      // Keep everything except the row being targeted
      const remainingRows = records
        .filter((r) => r.rowId !== rowId)
        .map((r) => ({
          date: r.date,
          invoiceNo: r.invoiceNo,
          brand: r.brand,
          pattern: r.pattern,
          dot: r.dot,
          quantity: r.quantity,
        }));

      await updateAllTyreRecords(accessToken, sheetConfig.spreadsheetId, remainingRows);

      const refreshedData = await fetchTyreRecords(accessToken, sheetConfig.spreadsheetId);
      setRecords(refreshedData);
    } catch (err: any) {
      setGlobalError(err.message || 'Error occurred while removing row on spreadsheet.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Prelaunch / verification indicator spinner
  if (!authStateLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50">
        <div className="flex flex-col items-center gap-3">
          <Activity className="h-8 w-8 text-indigo-500 animate-spin" />
          <p className="text-sm font-medium text-gray-400 font-mono">Verifying authorization session...</p>
        </div>
      </div>
    );
  }

  // 1. Sign In screen (if not authenticated)
  if (!user || !accessToken) {
    return (
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-gray-50/50 selection:bg-indigo-100">
        <div className="lg:col-span-5 flex flex-col justify-center p-8 md:p-12 lg:p-16 bg-white border-r border-gray-100 shadow-sm z-10">
          <div className="max-w-md w-full mx-auto space-y-8">
            {/* Minimal App brand indicator */}
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-100 text-white">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <span className="font-extrabold text-gray-900 text-lg tracking-tight">Billed Stock Tracker</span>
                <p className="text-[10px] font-mono font-medium tracking-wider text-indigo-600 uppercase">Tyre Retail Workspace</p>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight leading-tight">
                Tyre Billed Stock Tracker
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed">
                Connect your personal Google Sheets instance to store, filter, and monitor billed tyre stock. Includes real-time indicators for aged tyre stock and low supply.
              </p>
            </div>

            {/* Feature lists */}
            <div className="space-y-3.5 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="flex items-start gap-3 text-xs text-gray-600">
                <CheckCircle className="h-4.5 w-4.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <b className="text-gray-900 font-semibold block mb-0.5">Separate DoT Records Tracking</b>
                  Group tyres under the same Invoice and size, while saving and displaying each and every production week/quantity row.
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-gray-600">
                <CheckCircle className="h-4.5 w-4.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <b className="text-gray-900 font-semibold block mb-0.5">Low & Aged Stock Alerts</b>
                  Flags inventory on stock below thresholds and highlights aged Tyres (1+ year old) derived instantly from the DOT codes.
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-gray-600">
                <CheckCircle className="h-4.5 w-4.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <b className="text-gray-900 font-semibold block mb-0.5">Google Sheets Backend</b>
                  Zero server database overhead. All entries are written directly onto your spreadsheet securely.
                </div>
              </div>
            </div>

            {/* Google Sign In Call to Action */}
            <div className="space-y-4 pt-2">
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isLoggingIn}
                className="gsi-material-button w-full shadow-sm hover:shadow transition-shadow py-5 flex items-center justify-center"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper justify-center">
                  <div className="gsi-material-button-icon">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents font-semibold">{isLoggingIn ? 'Authorizing with Google...' : 'Sign In with Google'}</span>
                </div>
              </button>

              <div className="text-[11px] text-gray-400 leading-relaxed text-center flex items-center justify-center gap-1">
                <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
                <span>Stores details inside your personal drive with user permission.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic visual board on correct sizing */}
        <div className="hidden lg:col-span-12 lg:flex xl:col-span-7 bg-indigo-950 items-center justify-center p-16 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-gradient from-indigo-900 to-indigo-950 opacity-90"></div>
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div className="relative max-w-xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 bg-indigo-900/40 border border-indigo-800/80 px-3 py-1 rounded-full text-indigo-300 text-xs font-semibold font-mono">
              <Database className="h-3.5 w-3.5" />
              <span>Real-time Sheets Synchronous Storage</span>
            </div>
            
            <h2 className="text-4xl font-extrabold tracking-tight">
              Clutter-Free Tyre Stock Management
            </h2>
            
            <p className="text-sm text-indigo-200 leading-relaxed">
              Designed explicitly for tyre retailers facing dynamic batch manufacturing variations. Keep track of individual production weeks while monitoring inventory age in a highly responsive desktop and mobile layout.
            </p>

            <div className="flex justify-center gap-6 pt-4 text-xs font-mono font-medium text-indigo-300">
              <span className="flex items-center gap-1.5">
                ● 2-Digit Week
              </span>
              <span className="flex items-center gap-1.5">
                ● 2-Digit Year
              </span>
              <span className="flex items-center gap-1.5">
                ● Auto Inventory Sums
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Core Workspace View (Authenticated)
  return (
    <div className="min-h-screen bg-[#f8fbfe] pb-12 selection:bg-indigo-100">
      
      {/* Title Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-extrabold text-gray-900 leading-none text-sm md:text-base">
                Tyre Billed Stock Tracker
              </h1>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">Retail Stock Manager // Active</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSyncing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-mono">
                <Activity className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Syncing sheet...</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="hidden sm:inline">Sheets Linked</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        
        {/* Connection Widget */}
        <SheetsConfig
          sheetName={sheetConfig.spreadsheetName}
          sheetUrl={sheetConfig.spreadsheetUrl}
          userEmail={user.email}
          onRefresh={syncDatabaseAndRecords}
          onLogout={handleLogout}
          isSyncing={isSyncing}
        />

        {/* Global Error Notice Bar */}
        {globalError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 flex items-start gap-2">
            <span className="font-bold">Error:</span>
            <span>{globalError}</span>
          </div>
        )}

        {/* Desktop Workspace Grid (Clutter-free, Left Form, Right list) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          <div className="lg:col-span-5">
            <TyreForm
              onSave={handleSaveRecords}
              existingRecords={records}
              isSaving={isSaving}
              editingGroup={editingGroup}
              onCancelEdit={() => setEditingGroup(null)}
              onUpdate={handleUpdateRecords}
              editingRecord={editingRecord}
              onUpdateRecord={handleUpdateSingleRecord}
              onCancelEditRecord={() => setEditingRecord(null)}
            />
          </div>

          <div className="lg:col-span-7">
            <TyreList
              records={records}
              onDeleteGroup={handleDeleteGroup}
              onDeleteRow={handleDeleteRow}
              isDeleting={isDeleting}
              onEditGroup={(group) => {
                setEditingGroup(group);
                setEditingRecord(null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onEditRecord={(record) => {
                setEditingRecord(record);
                setEditingGroup(null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>

        </div>

      </main>
    </div>
  );
}
