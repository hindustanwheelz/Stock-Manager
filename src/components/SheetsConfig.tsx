import React from 'react';
import { Database, ExternalLink, RefreshCw, LogOut, CheckCircle2 } from 'lucide-react';

interface SheetsConfigProps {
  sheetName: string | null;
  sheetUrl: string | null;
  userEmail: string | null;
  onRefresh: () => void;
  onLogout: () => void;
  isSyncing: boolean;
}

export const SheetsConfig: React.FC<SheetsConfigProps> = ({
  sheetName,
  sheetUrl,
  userEmail,
  onRefresh,
  onLogout,
  isSyncing,
}) => {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 md:p-6 shadow-sm mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Connection status and sheets meta */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-green-50 text-green-600 rounded-lg shrink-0 mt-0.5">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">Google Sheet Backend</h3>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> Synchronized
              </span>
            </div>
            
            <p className="text-sm text-gray-600 mt-1 font-mono break-all max-w-2xl bg-gray-50/50 p-2 rounded border border-gray-100">
              {sheetName || 'Tyre Billed Stock Tracker'}
            </p>

            {userEmail && (
              <p className="text-xs text-gray-400 mt-1.5 font-sans">
                Logged in as <span className="font-medium text-gray-600">{userEmail}</span>
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 sm:self-end md:self-center">
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-indigo-600 bg-gray-100 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-100 px-3 py-2 rounded-lg transition-colors cursor-pointer"
              title="Open the active Google Sheet in a new browser tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open Sheet</span>
            </a>
          )}

          <button
            onClick={onRefresh}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-indigo-600 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-100 px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Force refresh data from Google Sheet"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-white bg-white hover:bg-red-600 border border-gray-200 hover:border-red-600 px-3 py-2 rounded-lg transition-all cursor-pointer"
            title="Sign out of Google account"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
