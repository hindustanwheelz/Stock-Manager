import React, { useState, useMemo } from 'react';
import { Search, AlertTriangle, AlertCircle, ShoppingBag, Trash2, Calendar, Hash, Pencil, Receipt, ArrowDownLeft, ArrowUpRight, History, Layers } from 'lucide-react';
import { TyreRecord, GroupedTyre } from '../types';

interface TyreListProps {
  records: TyreRecord[];
  onDeleteGroup: (invoiceNo: string, brand: string, pattern: string) => Promise<void>;
  onDeleteRow: (rowId: number) => Promise<void>;
  isDeleting: boolean;
  onEditGroup: (group: GroupedTyre) => void;
  onEditRecord?: (record: TyreRecord) => void;
}

export const TyreList: React.FC<TyreListProps> = ({
  records,
  onDeleteGroup,
  onDeleteRow,
  isDeleting,
  onEditGroup,
  onEditRecord,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'low' | 'old'>('all');
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(4);
  const [listMode, setListMode] = useState<'live' | 'ledger'>('live');

  // The current year in context is 2026
  const CURRENT_YEAR = 2026;

  // =======================================================
  // COMPUTATION A: LIVE INVENTORY BALANCE (DELETES SOLD DOTS DYNAMICALLY)
  // =======================================================
  const liveInventoryGrouped = useMemo(() => {
    // Key: `${brand.toLowerCase()}|||${pattern.toLowerCase()}`
    const groupMap = new Map<string, {
      id: string;
      brand: string;
      pattern: string;
      dots: {
        dot: string;
        quantity: number;
        isOld: boolean;
        ageYears: number;
      }[];
      totalQuantity: number;
      isLowStock: boolean;
      hasOldStock: boolean;
    }>();

    records.forEach((r) => {
      const b = r.brand.trim();
      const p = r.pattern.trim();
      const d = r.dot.trim();
      if (!b || !p || !d) return;

      const groupKey = `${b.toLowerCase()}|||${p.toLowerCase()}`;

      // Calculate DoT age
      let isDotOld = false;
      let ageYears = 0;
      if (d && d.length === 4) {
        const yearShort = parseInt(d.substring(2, 4), 10);
        if (!isNaN(yearShort)) {
          const mfgYear = 2000 + yearShort;
          ageYears = CURRENT_YEAR - mfgYear;
          isDotOld = ageYears >= 1;
        }
      }

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          id: groupKey,
          brand: b,
          pattern: p,
          dots: [],
          totalQuantity: 0,
          isLowStock: false,
          hasOldStock: false,
        });
      }

      const grp = groupMap.get(groupKey)!;

      // Accumulate quantity for this DoT inside this brand+pattern spec
      const existingDot = grp.dots.find((item) => item.dot === d);
      if (existingDot) {
        existingDot.quantity += r.quantity;
      } else {
        grp.dots.push({
          dot: d,
          quantity: r.quantity,
          isOld: isDotOld,
          ageYears,
        });
      }
    });

    const result: any[] = [];

    groupMap.forEach((grp) => {
      // We only list DoTs that actually have remaining positive stock
      grp.dots = grp.dots.filter((item) => item.quantity > 0);
      grp.dots.sort((a, b) => b.dot.localeCompare(a.dot));

      // Calculate aggregated parameters
      grp.totalQuantity = grp.dots.reduce((sum, item) => sum + item.quantity, 0);
      grp.hasOldStock = grp.dots.some((item) => item.isOld);
      grp.isLowStock = grp.totalQuantity <= lowStockThreshold;

      // Only display brand+pattern if there is positive cumulative stock remaining
      if (grp.totalQuantity > 0) {
        result.push(grp);
      }
    });

    // Sort alphabetically by brand name
    return result.sort((a, b) => a.brand.localeCompare(b.brand) || a.pattern.localeCompare(b.pattern));
  }, [records, lowStockThreshold]);

  // Filtered Live Inventory list
  const filteredLiveInventory = useMemo(() => {
    return liveInventoryGrouped.filter((group) => {
      const matchesSearch =
        group.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.pattern.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.dots.some((d) => d.dot.includes(searchTerm));

      if (!matchesSearch) return false;

      if (activeFilter === 'low') return group.isLowStock;
      if (activeFilter === 'old') return group.hasOldStock;

      return true;
    });
  }, [liveInventoryGrouped, searchTerm, activeFilter]);

  // =======================================================
  // COMPUTATION B: TRANSACTIONS LEDGER (CHRONOLOGICAL EVENT LOGS)
  // =======================================================
  const filteredLedger = useMemo(() => {
    // Clone and sort chronologically descending by Date
    const sortedRecords = [...records].sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.rowId - a.rowId; // newest first
    });

    return sortedRecords.filter((r) => {
      const matchesSearch =
        r.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.pattern.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.dot.includes(searchTerm);

      if (!matchesSearch) return false;

      if (activeFilter === 'low') {
        // Highlighting ledger purchase line quantities that were less than low stock threshold
        return r.quantity > 0 && r.quantity <= lowStockThreshold;
      }
      if (activeFilter === 'old') {
        if (r.dot && r.dot.length === 4) {
          const yearShort = parseInt(r.dot.substring(2, 4), 10);
          if (!isNaN(yearShort)) {
            const mfgYear = 2000 + yearShort;
            return (CURRENT_YEAR - mfgYear) >= 1;
          }
        }
        return false;
      }

      return true;
    });
  }, [records, searchTerm, activeFilter, lowStockThreshold]);

  // =======================================================
  // IN-UI CONFIRM DELETION HOOKS
  // =======================================================
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<number | null>(null);

  const handleDeleteClick = (group: any) => {
    setConfirmDeleteId(group.id);
  };

  const handleConfirmDeleteGroup = (group: any) => {
    onDeleteGroup(group.invoiceNo, group.brand, group.pattern);
    setConfirmDeleteId(null);
  };

  const handleConfirmDeleteRow = (rowId: number) => {
    onDeleteRow(rowId);
    setConfirmDeleteRowId(null);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
      
      {/* Top Header Section with Tab Switchers */}
      <div className="p-5 md:p-6 pb-4 border-b border-gray-50 bg-gray-50/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-indigo-500" />
              <span>Inventory & Ledger</span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {listMode === 'live' 
                ? `Active Stock: ${filteredLiveInventory.length} sizes in warehouse` 
                : `Transactions Log: ${filteredLedger.length} ledger movements`}
            </p>
          </div>

          {/* Toggle Tab Button List */}
          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 self-start">
            <button
              onClick={() => {
                setListMode('live');
                setSearchTerm('');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                listMode === 'live'
                  ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Live Stock</span>
            </button>
            <button
              onClick={() => {
                setListMode('ledger');
                setSearchTerm('');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                listMode === 'ledger'
                  ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Activity Log</span>
            </button>
          </div>
        </div>

        {/* Low Stock Adjusters */}
        <div className="flex items-center gap-2 mt-4 text-xs">
          <span className="font-semibold text-gray-400 uppercase tracking-widest text-[9px]">
            Alert Threshold:
          </span>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={() => setLowStockThreshold((t) => Math.max(1, t - 1))}
              className="px-1.5 py-0.5 text-xs bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 font-bold text-gray-500 cursor-pointer"
            >
              -
            </button>
            <span className="text-xs font-mono font-bold text-gray-900 px-1 inline-block min-w-[20px] text-center">
              {lowStockThreshold}
            </span>
            <button
              onClick={() => setLowStockThreshold((t) => t + 1)}
              className="px-1.5 py-0.5 text-xs bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 font-bold text-gray-500 cursor-pointer"
            >
              +
            </button>
          </div>
          <span className="text-gray-400">Tyres</span>
        </div>
      </div>

      <div className="p-5 md:p-6">
        {/* Search controls & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={listMode === 'live' ? "Search Brand, Pattern, DoT..." : "Search Brand, Pattern, Invoice, DoT..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 pl-9 pr-3 rounded-lg outline-none placeholder:text-gray-400 font-mono"
            />
          </div>

          <div className="flex gap-1.5 bg-gray-50 p-1 rounded-lg border border-gray-200 shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-white text-gray-950 shadow-2xs border border-gray-100'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              All Rows
            </button>
            <button
              onClick={() => setActiveFilter('low')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                activeFilter === 'low'
                  ? 'bg-red-500 text-white font-bold'
                  : 'text-red-600 hover:bg-red-50'
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5 animate-pulse" />
              <span>Low Stock</span>
            </button>
            <button
              onClick={() => setActiveFilter('old')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                activeFilter === 'old'
                  ? 'bg-amber-500 text-white font-bold'
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Old Stock</span>
            </button>
          </div>
        </div>

        {listMode === 'live' ? (
          // =======================================================
          // TAB 1: LIVE STOCK OVERVIEW LISTING
          // =======================================================
          filteredLiveInventory.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-gray-100 rounded-xl bg-gray-50/50">
              <ShoppingBag className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400 font-semibold">No active stock matches search requirements.</p>
              <button
                onClick={() => { setSearchTerm(''); setActiveFilter('all'); }}
                className="text-xs text-indigo-500 font-bold hover:underline mt-1 cursor-pointer"
              >
                Reset current filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredLiveInventory.map((group) => {
                return (
                  <div
                    key={group.id}
                    className="group border border-gray-100 hover:border-indigo-100 bg-white hover:bg-indigo-50/5 rounded-xl p-4 transition-all duration-200 flex flex-col justify-between shadow-2xs"
                  >
                    <div>
                      {/* Top status badges */}
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <span className="inline-flex items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Warehouse Stock
                        </span>

                        <div className="flex gap-1 items-center">
                          {group.isLowStock ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              <AlertCircle className="h-3 w-3 text-red-500" />
                              <span>LOW STOCK</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              <span>● In Stock</span>
                            </span>
                          )}

                          {group.hasOldStock && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                              <span>OLD STOCK</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Brand name & sizing Info */}
                      <div className="mt-1">
                        <h4 className="font-bold text-gray-950 font-sans tracking-tight text-base">
                          {group.brand}
                        </h4>
                        <p className="text-sm font-mono text-gray-600 font-semibold">
                          {group.pattern}
                        </p>
                      </div>

                      {/* Display DoTs currently in Stock */}
                      <div className="mt-4 space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Active In-Stock DoTs:
                        </p>
                        {group.dots.map((d, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between py-1 px-2 rounded-lg bg-gray-50 border border-gray-100/50"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-gray-800 font-bold bg-white border border-gray-100 px-1.5 py-0.5 rounded shadow-3xs">
                                DOT {d.dot}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                (Age: {d.ageYears} yr{d.ageYears !== 1 ? 's' : ''})
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {d.isOld && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-100">
                                  <span>OLD</span>
                                </span>
                              )}
                              <span className="font-mono text-xs font-bold text-gray-900 bg-indigo-50/50 px-1.5 py-0.2 rounded border border-indigo-100/50">
                                {d.quantity} units
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer Batch Total Quantity */}
                    <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between text-xs">
                      <div className="text-gray-400 font-sans text-[11px]">
                        Exact Total Stock: <b className="font-mono text-indigo-700">{group.totalQuantity} tyres</b>
                      </div>
                      <span className="text-[10px] text-gray-400 italic">
                        Real-time with DOT removals
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // =======================================================
          // TAB 2: CHRONOLOGICAL TRANSACTION LEDGER / LOG
          // =======================================================
          filteredLedger.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-gray-100 rounded-xl bg-gray-50/50">
              <History className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400 font-semibold">No transactions recorded in spreadsheet logs.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredLedger.map((r) => {
                const isRemoval = r.quantity < 0;
                const absQty = Math.abs(r.quantity);

                return (
                  <div
                    key={r.rowId}
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between border rounded-xl p-3 sm:py-2.5 hover:shadow-2xs transition-all gap-4 ${
                      isRemoval 
                        ? 'border-rose-100 bg-rose-50/10' 
                        : 'border-emerald-100 bg-emerald-50/5'
                    }`}
                  >
                    {/* Event indicators & parameters */}
                    <div className="flex items-center gap-3.5 flex-1 w-full">
                      {/* Received vs Sold Pill Indicators */}
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase font-mono border flex items-center gap-1 shadow-3xs shrink-0 ${
                        isRemoval
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}>
                        {isRemoval ? (
                          <>
                            <ArrowUpRight className="h-3 w-3 stroke-[3px]" />
                            <span>SOLD</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownLeft className="h-3 w-3 stroke-[3px]" />
                            <span>Billed</span>
                          </>
                        )}
                      </span>

                      {/* Item core specs */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 text-sm truncate">
                            {r.brand}
                          </span>
                          <span className="font-mono text-xs text-gray-500 font-semibold bg-gray-100/80 px-1.5 py-0.5 rounded">
                            {r.pattern}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-gray-300" />
                            <span>{r.date}</span>
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3 text-gray-300" />
                            <span>Invoice: <b>{r.invoiceNo}</b></span>
                          </span>
                          <span>•</span>
                          <span className="font-mono font-bold text-gray-500">DoT: {r.dot}</span>
                        </div>
                      </div>
                    </div>

                    {/* Numeric counts and Actions delete */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto self-stretch sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                      <div>
                        <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded-md ${
                          isRemoval 
                            ? 'text-rose-700 bg-rose-50/50' 
                            : 'text-emerald-700 bg-emerald-50/50'
                        }`}>
                          {isRemoval ? '-' : '+'}{absQty} Tyre{absQty !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {confirmDeleteRowId === r.rowId ? (
                          <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                            <span className="text-[9px] font-bold text-red-700 px-1">Delete item?</span>
                            <button
                              onClick={() => handleConfirmDeleteRow(r.rowId)}
                              className="px-2 py-0.5 text-[9px] font-bold text-white bg-red-600 hover:bg-red-700 rounded transition-colors cursor-pointer"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteRowId(null)}
                              className="px-1.5 py-0.5 text-[9px] font-medium text-gray-500 bg-white hover:bg-gray-100 border border-gray-200 rounded transition-colors cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => onEditRecord?.(r)}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-lg transition-colors cursor-pointer"
                              title="Edit this record row"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteRowId(r.rowId)}
                              disabled={isDeleting}
                              className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Delete this spreadsheet row"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
        ))}
      </div>
    </div>
  );
};
