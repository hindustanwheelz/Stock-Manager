import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, Receipt, Award, Tag, Plus, Trash2, Save, HelpCircle, AlertCircle, X, ShoppingCart, ArrowDownLeft, ArrowUpRight, Hash } from 'lucide-react';
import { DoTQty, TyreRecord, GroupedTyre } from '../types';

interface TyreFormProps {
  onSave: (records: Omit<TyreRecord, 'rowId'>[]) => Promise<void>;
  existingRecords: TyreRecord[];
  isSaving: boolean;
  editingGroup?: GroupedTyre | null;
  onCancelEdit?: () => void;
  onUpdate?: (oldInvoiceNo: string, oldBrand: string, oldPattern: string, updatedRows: Omit<TyreRecord, 'rowId'>[]) => Promise<void>;
  editingRecord?: TyreRecord | null;
  onUpdateRecord?: (rowId: number, updatedRecord: Omit<TyreRecord, 'rowId'>) => Promise<void>;
  onCancelEditRecord?: () => void;
}

export const TyreForm: React.FC<TyreFormProps> = ({
  onSave,
  existingRecords,
  isSaving,
  editingGroup,
  onCancelEdit,
  onUpdate,
  editingRecord,
  onUpdateRecord,
  onCancelEditRecord,
}) => {
  // Mode selection: 'inward' (Received Billed Stock) or 'outward' (Sold Tyres)
  const [formMode, setFormMode] = useState<'inward' | 'outward'>('inward');

  // Load editingGroup details if set (always forces mode to inward edit representation)
  useEffect(() => {
    if (editingGroup) {
      setFormMode('inward');
      setDate(editingGroup.date);
      setInvoiceNo(editingGroup.invoiceNo);
      setBrand(editingGroup.brand);
      setPattern(editingGroup.pattern);
      setDotQtys(editingGroup.dots.map((d) => ({ dot: d.dot, quantity: d.quantity })));
    }
  }, [editingGroup]);

  // Load editingRecord details if set (supports both inward and outward edits)
  useEffect(() => {
    if (editingRecord) {
      if (editingRecord.quantity > 0) {
        setFormMode('inward');
        setDate(editingRecord.date);
        setInvoiceNo(editingRecord.invoiceNo);
        setBrand(editingRecord.brand);
        setPattern(editingRecord.pattern);
        setDotQtys([{ dot: editingRecord.dot, quantity: editingRecord.quantity }]);
      } else {
        setFormMode('outward');
        setSaleDate(editingRecord.date);
        setSaleInvoiceNo(editingRecord.invoiceNo);
        setSaleBrand(editingRecord.brand);
        setSalePattern(editingRecord.pattern);
        setSaleDotQtys([{ dot: editingRecord.dot, quantity: Math.abs(editingRecord.quantity) }]);
      }
    }
  }, [editingRecord]);

  // Reset form when editing finishes or is cancelled
  useEffect(() => {
    if (!editingGroup && !editingRecord) {
      // Reset Inward
      setInvoiceNo('');
      setBrand('');
      setPattern('');
      setDotQtys([{ dot: '', quantity: 4 }]);

      // Reset Outward
      setSaleBrand('');
      setSalePattern('');
      setSaleDotQtys([{ dot: '', quantity: 1 }]);
      setSaleInvoiceNo('SOLD');
    }
  }, [editingGroup, editingRecord]);

  // ==========================================
  // STATE DEFINITIONS FOR INWARD MODE
  // ==========================================
  const [date, setDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [invoiceNo, setInvoiceNo] = useState('');
  const [brand, setBrand] = useState('');
  const [pattern, setPattern] = useState('');
  const [dotQtys, setDotQtys] = useState<DoTQty[]>([{ dot: '', quantity: 4 }]);

  // Autocomplete suggestions states (Inward Mode)
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [showPatternSuggestions, setShowPatternSuggestions] = useState(false);

  // ==========================================
  // STATE DEFINITIONS FOR OUTWARD MODE
  // ==========================================
  const [saleDate, setSaleDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [saleInvoiceNo, setSaleInvoiceNo] = useState('SOLD');
  const [saleBrand, setSaleBrand] = useState('');
  const [salePattern, setSalePattern] = useState('');
  const [saleDotQtys, setSaleDotQtys] = useState<DoTQty[]>([{ dot: '', quantity: 1 }]);

  // ==========================================
  // DYNAMIC LIVE STOCK COMPUTATIONS (FOR OUTWARD SELECTION)
  // ==========================================
  const liveStock = useMemo(() => {
    // brand -> pattern -> dot -> numeric stock quantity
    const balances: Record<string, Record<string, Record<string, number>>> = {};

    existingRecords.forEach((r) => {
      const b = r.brand.trim();
      const p = r.pattern.trim();
      const d = r.dot.trim();
      if (!b || !p || !d) return;

      if (!balances[b]) {
        balances[b] = {};
      }
      if (!balances[b][p]) {
        balances[b][p] = {};
      }
      if (!balances[b][p][d]) {
        balances[b][p][d] = 0;
      }
      balances[b][p][d] += r.quantity;
    });

    // Extract brands which have any DoT with remaining stock > 0
    const availableBrands = Object.keys(balances)
      .filter((b) => {
        let brandHasStock = false;
        Object.keys(balances[b]).forEach((p) => {
          Object.keys(balances[b][p]).forEach((d) => {
            if (balances[b][p][d] > 0) {
              brandHasStock = true;
            }
          });
        });
        return brandHasStock;
      })
      .sort();

    return {
      balances,
      availableBrands,
      getPatternsForBrand: (bName: string) => {
        if (!balances[bName]) return [];
        return Object.keys(balances[bName])
          .filter((p) => {
            let patternHasStock = false;
            Object.keys(balances[bName][p]).forEach((d) => {
              if (balances[bName][p][d] > 0) {
                patternHasStock = true;
              }
            });
            return patternHasStock;
          })
          .sort();
      },
      getDotsForPattern: (bName: string, pName: string) => {
        if (!balances[bName] || !balances[bName][pName]) return [];
        const dotsList: { dot: string; qty: number }[] = [];
        Object.keys(balances[bName][pName]).forEach((d) => {
          const qty = balances[bName][pName][d];
          if (qty > 0) {
            dotsList.push({ dot: d, qty });
          }
        });
        // Sort by production week/year descending (newest production first)
        return dotsList.sort((a, b) => b.dot.localeCompare(a.dot));
      },
    };
  }, [existingRecords]);

  // Handle outward cascading selection state resets
  const handleSaleBrandChange = (val: string) => {
    setSaleBrand(val);
    setSalePattern('');
    setSaleDotQtys([{ dot: '', quantity: 1 }]);
  };

  const handleSalePatternChange = (val: string) => {
    setSalePattern(val);
    setSaleDotQtys([{ dot: '', quantity: 1 }]);
  };

  const handleAddSaleDotRow = () => {
    setSaleDotQtys([...saleDotQtys, { dot: '', quantity: 1 }]);
  };

  const handleRemoveSaleDotRow = (index: number) => {
    if (saleDotQtys.length === 1) return;
    const newRows = [...saleDotQtys];
    newRows.splice(index, 1);
    setSaleDotQtys(newRows);
  };

  const handleSaleDotChange = (idx: number, val: string) => {
    const newRows = [...saleDotQtys];
    newRows[idx].dot = val;
    newRows[idx].quantity = 1; // Reset quantity to default on dot change
    setSaleDotQtys(newRows);
  };

  const handleSaleQtyChange = (idx: number, val: number, maxAvailable: number) => {
    const newRows = [...saleDotQtys];
    newRows[idx].quantity = Math.min(maxAvailable, Math.max(1, val));
    setSaleDotQtys(newRows);
  };

  // Extract unique brands and patterns for smart autocomplete (Inward Mode)
  const autocompletes = useMemo(() => {
    const brandsSet = new Set<string>();
    const patternsMap = new Map<string, Set<string>>();

    existingRecords.forEach((r) => {
      if (r.brand) {
        const bNormalized = r.brand.trim();
        brandsSet.add(bNormalized);

        if (r.pattern) {
          if (!patternsMap.has(bNormalized)) {
            patternsMap.set(bNormalized, new Set());
          }
          patternsMap.get(bNormalized)!.add(r.pattern.trim());
        }
      }
    });

    return {
      brands: Array.from(brandsSet).sort(),
      patternsByBrand: (b: string) => {
        const bNorm = b.trim();
        const set = patternsMap.get(bNorm);
        return set ? Array.from(set).sort() : [];
      },
    };
  }, [existingRecords]);

  const filteredBrands = useMemo(() => {
    if (!brand) return autocompletes.brands;
    return autocompletes.brands.filter((b) =>
      b.toLowerCase().includes(brand.toLowerCase())
    );
  }, [brand, autocompletes.brands]);

  const filteredPatterns = useMemo(() => {
    const brandPatterns = autocompletes.patternsByBrand(brand);
    if (!pattern) return brandPatterns;
    return brandPatterns.filter((p) =>
      p.toLowerCase().includes(pattern.toLowerCase())
    );
  }, [pattern, brand, autocompletes]);

  // Validate DOT format (WWYY)
  const validateDot = (dot: string): { isValid: boolean; error?: string } => {
    if (!dot) return { isValid: false, error: 'Required' };
    if (!/^\d{4}$/.test(dot)) {
      return { isValid: false, error: 'DoT must be exactly 4 digits' };
    }
    const week = parseInt(dot.substring(0, 2), 10);
    if (week < 1 || week > 53) {
      return { isValid: false, error: 'Week (first 2 digits) must be 01 - 53' };
    }
    return { isValid: true };
  };

  // Inward rows handlers
  const handleAddDotRow = () => {
    const lastDot = dotQtys[dotQtys.length - 1]?.dot || '';
    setDotQtys([...dotQtys, { dot: lastDot, quantity: 4 }]);
  };

  const handleRemoveDotRow = (index: number) => {
    if (dotQtys.length === 1) return;
    const newRows = [...dotQtys];
    newRows.splice(index, 1);
    setDotQtys(newRows);
  };

  const handleDotChange = (index: number, value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 4);
    const newRows = [...dotQtys];
    newRows[index].dot = digitsOnly;
    setDotQtys(newRows);
  };

  const handleQtyChange = (index: number, value: number) => {
    const newRows = [...dotQtys];
    newRows[index].quantity = Math.max(1, value);
    setDotQtys(newRows);
  };

  // Calculate total quantity (Inward/Outward dynamic display)
  const displayTotalQty = useMemo(() => {
    if (formMode === 'inward') {
      return dotQtys.reduce((sum, item) => sum + (item.quantity || 0), 0);
    } else {
      return saleDotQtys.reduce((sum, item) => sum + (item.quantity || 0), 0);
    }
  }, [formMode, dotQtys, saleDotQtys]);

  const [formError, setFormError] = useState<string | null>(null);

  // Form submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (formMode === 'inward') {
      // INWARD STOCK ENTRY SUBMISSION
      if (!date) return setFormError('Please select a valid date');
      if (!invoiceNo.trim()) return setFormError('Please enter the Invoice Number');
      if (!brand.trim()) return setFormError('Please select or write a Brand name');
      if (!pattern.trim()) return setFormError('Please enter a Pattern/Size name');

      for (let i = 0; i < dotQtys.length; i++) {
        const { isValid, error } = validateDot(dotQtys[i].dot);
        if (!isValid) {
          return setFormError(`Invalid DoT Row #${i + 1}: ${error}`);
        }
        if (!dotQtys[i].quantity || dotQtys[i].quantity <= 0) {
          return setFormError(`Invalid Quantity in Row #${i + 1}`);
        }
      }

      try {
        if (editingRecord && onUpdateRecord) {
          const updatedRecord: Omit<TyreRecord, 'rowId'> = {
            date,
            invoiceNo: invoiceNo.trim().toUpperCase(),
            brand: brand.trim(),
            pattern: pattern.trim(),
            dot: dotQtys[0].dot,
            quantity: dotQtys[0].quantity,
          };
          await onUpdateRecord(editingRecord.rowId, updatedRecord);
        } else {
          const recordsToSave: Omit<TyreRecord, 'rowId'>[] = dotQtys.map((row) => ({
            date,
            invoiceNo: invoiceNo.trim().toUpperCase(),
            brand: brand.trim(),
            pattern: pattern.trim(),
            dot: row.dot,
            quantity: row.quantity,
          }));

          if (editingGroup && onUpdate) {
            await onUpdate(
              editingGroup.invoiceNo,
              editingGroup.brand,
              editingGroup.pattern,
              recordsToSave
            );
          } else {
            await onSave(recordsToSave);
          }
        }

        // Reset
        setInvoiceNo('');
        setBrand('');
        setPattern('');
        setDotQtys([{ dot: '', quantity: 4 }]);
      } catch (err: any) {
        setFormError(err.message || 'Error occurred while saving records.');
      }
    } else {
      // OUTWARD SALE ENTRY SUBMISSION (REDUCES STOCK WITH NEGATIVE QUANTITY)
      if (!saleDate) return setFormError('Please select a valid date of sale');
      if (!saleBrand) return setFormError('Please select a Tyre Brand');
      if (!salePattern) return setFormError('Please select a Pattern / Size');

      if (saleDotQtys.length === 0) {
        return setFormError('Please specify at least one DoT for the sale transaction.');
      }

      // Check for empty/invalid selections and aggregate total per unique DOT to ensure overall limits
      const aggregatedQtyByDot: Record<string, number> = {};
      for (let i = 0; i < saleDotQtys.length; i++) {
        const item = saleDotQtys[i];
        if (!item.dot) {
          return setFormError(`Please select a valid DoT in Row #${i + 1}`);
        }
        if (!item.quantity || item.quantity <= 0) {
          return setFormError(`Please enter a valid sale quantity in Row #${i + 1}`);
        }
        aggregatedQtyByDot[item.dot] = (aggregatedQtyByDot[item.dot] || 0) + item.quantity;
      }

      // Cap bounds verification
      for (const [dot, totalQty] of Object.entries(aggregatedQtyByDot)) {
        const maxAvailable = getMaxAvailableForDot(dot);
        if (totalQty > maxAvailable) {
          return setFormError(
            `Insufficient stock! You requested ${totalQty} units of DoT ${dot}, but only ${maxAvailable} are available.`
          );
        }
      }

      try {
        if (editingRecord && onUpdateRecord) {
          const updatedRecord: Omit<TyreRecord, 'rowId'> = {
            date: saleDate,
            invoiceNo: saleInvoiceNo.trim().toUpperCase() || 'SOLD',
            brand: saleBrand,
            pattern: salePattern,
            dot: saleDotQtys[0].dot,
            quantity: -saleDotQtys[0].quantity,
          };
          await onUpdateRecord(editingRecord.rowId, updatedRecord);
        } else {
          const recordsToSave: Omit<TyreRecord, 'rowId'>[] = saleDotQtys.map((row) => ({
            date: saleDate,
            invoiceNo: saleInvoiceNo.trim().toUpperCase() || 'SOLD',
            brand: saleBrand,
            pattern: salePattern,
            dot: row.dot,
            quantity: -row.quantity, // Negative value signifies sales / removals
          }));

          await onSave(recordsToSave);
        }

        // Reset Sale Form
        setSaleBrand('');
        setSalePattern('');
        setSaleDotQtys([{ dot: '', quantity: 1 }]);
        setSaleInvoiceNo('SOLD');
      } catch (err: any) {
        setFormError(err.message || 'Error occurred while recording sale transactions.');
      }
    }
  };

  // Available dots for the selected brand & pattern in outward mode
  const currentAvailableDots = useMemo(() => {
    if (!saleBrand || !salePattern) return [];
    const dots = liveStock.getDotsForPattern(saleBrand, salePattern);

    // If we're editing a sale record, make sure its specific original DoT is in the list
    if (
      editingRecord &&
      editingRecord.quantity < 0 &&
      editingRecord.brand.trim().toLowerCase() === saleBrand.trim().toLowerCase() &&
      editingRecord.pattern.trim().toLowerCase() === salePattern.trim().toLowerCase()
    ) {
      const alreadyIncluded = dots.some((d) => d.dot === editingRecord.dot);
      if (!alreadyIncluded) {
        dots.push({ dot: editingRecord.dot, qty: 0 });
      }
    }
    return dots;
  }, [saleBrand, salePattern, liveStock, editingRecord]);

  // Dynamic stock limit query per individual DOT
  const getMaxAvailableForDot = (dot: string): number => {
    if (!saleBrand || !salePattern || !dot) return 0;
    const baseQty = liveStock.balances[saleBrand]?.[salePattern]?.[dot] || 0;
    if (
      editingRecord &&
      editingRecord.quantity < 0 &&
      editingRecord.brand.trim().toLowerCase() === saleBrand.trim().toLowerCase() &&
      editingRecord.pattern.trim().toLowerCase() === salePattern.trim().toLowerCase() &&
      editingRecord.dot.trim() === dot.trim()
    ) {
      return baseQty + Math.abs(editingRecord.quantity);
    }
    return baseQty;
  };

  const isEditing = !!(editingGroup || editingRecord);
  const isEditingSale = !!(editingRecord && editingRecord.quantity < 0);
  const cardBorderBg = isEditingSale
    ? 'border-rose-400 bg-rose-50/5'
    : isEditing
    ? 'border-indigo-400 bg-indigo-50/10'
    : 'border-gray-100 bg-white';

  return (
    <div className={`border rounded-xl overflow-hidden shadow-sm mb-6 transition-all duration-250 ${cardBorderBg}`}>
      
      {/* Tab Switcher - Hidden in Edit Mode */}
      {!isEditing && (
        <div className="flex border-b border-gray-100 bg-gray-50/50">
          <button
            type="button"
            onClick={() => {
              setFormMode('inward');
              setFormError(null);
            }}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 cursor-pointer transition-colors ${
              formMode === 'inward'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
            }`}
          >
            <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
            <span>Record Purchases (In)</span>
          </button>
          
          <button
            type="button"
            onClick={() => {
              setFormMode('outward');
              setFormError(null);
            }}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 cursor-pointer transition-colors ${
              formMode === 'outward'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
            }`}
          >
            <ArrowUpRight className="h-4 w-4 text-rose-500" />
            <span>Record Sales (Out)</span>
          </button>
        </div>
      )}

      <div className="p-5 md:p-6">
        {/* Form Title & Cancel Edit Action */}
        <div className="flex justify-between items-center mb-4 gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-indigo-500 font-bold" />
            {editingGroup ? (
              <span className="text-indigo-600 animate-pulse">Edit Billed Purchase Group</span>
            ) : editingRecord ? (
              <span className={isEditingSale ? "text-rose-600 animate-pulse" : "text-indigo-600 animate-pulse"}>
                Edit {isEditingSale ? 'Sale' : 'Purchase'} Record
              </span>
            ) : formMode === 'inward' ? (
              <span>Received Stock Form</span>
            ) : (
              <span>Log Tyre Sale / Outward Form</span>
            )}
          </h2>
          
          {isEditing && (
            <button
              type="button"
              onClick={() => {
                if (editingRecord && onCancelEditRecord) {
                  onCancelEditRecord();
                } else if (editingGroup && onCancelEdit) {
                  onCancelEdit();
                }
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 bg-white px-2 py-1 rounded-lg transition-colors cursor-pointer border border-gray-200"
            >
              <X className="h-3 w-3.5" />
              <span>Cancel Edit</span>
            </button>
          )}
        </div>

        {formMode === 'inward' ? (
          // =======================================================
          // INWARD RECEIVED STOCK FORM
          // =======================================================
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              {/* Date Input */}
              <div className="relative">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-gray-400" />
                  <span>Date</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 rounded-lg outline-none font-mono"
                  required
                />
              </div>

              {/* Invoice No */}
              <div className="relative">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                  <Receipt className="h-3 w-3 text-gray-400" />
                  <span>Invoice No</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-1002"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="w-full bg-white border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 rounded-lg outline-none font-mono placeholder:text-gray-300 uppercase"
                  required
                />
              </div>

              {/* Brand Autocomplete */}
              <div className="relative">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                  <Award className="h-3 w-3 text-gray-400" />
                  <span>Brand</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bridgestone"
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    setShowBrandSuggestions(true);
                  }}
                  onFocus={() => setShowBrandSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowBrandSuggestions(false), 200)}
                  className="w-full bg-white border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 rounded-lg outline-none placeholder:text-gray-300"
                  required
                />
                {showBrandSuggestions && filteredBrands.length > 0 && (
                  <div className="absolute z-35 w-full bg-white border border-gray-100 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {filteredBrands.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => {
                          setBrand(b);
                          setShowBrandSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer font-medium"
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Pattern / Size */}
              <div className="relative">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                  <Tag className="h-3 w-3 text-gray-400" />
                  <span>Pattern / Size</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 195/65 R15"
                  value={pattern}
                  onChange={(e) => {
                    setPattern(e.target.value);
                    setShowPatternSuggestions(true);
                  }}
                  onFocus={() => setShowPatternSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowPatternSuggestions(false), 200)}
                  className="w-full bg-white border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 rounded-lg outline-none placeholder:text-gray-300 font-mono"
                  required
                />
                {showPatternSuggestions && filteredPatterns.length > 0 && (
                  <div className="absolute z-35 w-full bg-white border border-gray-100 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {filteredPatterns.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setPattern(p);
                          setShowPatternSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer font-mono"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* DOT & Quantities Sub-Form Group */}
            <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 mt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <span>Weeks of Production & Quantities</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 font-mono">
                    {dotQtys.length} Row{dotQtys.length > 1 ? 's' : ''}
                  </span>
                </h3>
                
                {/* Add dynamic check: do not allow adding multiple DOT rows when editing an individual single record */}
                {!editingRecord && (
                  <button
                    type="button"
                    onClick={handleAddDotRow}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Another DoT</span>
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {dotQtys.map((item, idx) => (
                  <div key={idx} className="flex gap-3 items-center">
                    <span className="text-[10px] font-mono font-medium text-gray-400 w-6">
                      #{idx + 1}
                    </span>

                    {/* DoT Input */}
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="DoT (WWYY) e.g. 1525"
                        value={item.dot}
                        onChange={(e) => handleDotChange(idx, e.target.value)}
                        className="w-full bg-white border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 rounded-lg outline-none font-mono placeholder:text-gray-300"
                        required
                      />
                      {item.dot && (
                        <span className="absolute right-3 top-2 text-xs font-mono text-gray-400 pointer-events-none">
                          {validateDot(item.dot).isValid ? (
                            <span className="text-green-500 font-sans font-bold">✓</span>
                          ) : (
                            <span className="text-amber-500 font-bold" title={validateDot(item.dot).error}>!</span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Quantity Selector */}
                    <div className="w-24 md:w-32 flex items-center border border-gray-200 bg-white rounded-lg">
                      <button
                        type="button"
                        onClick={() => handleQtyChange(idx, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        className="px-2.5 py-2 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:pointer-events-none text-sm font-medium border-r border-gray-100 cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity || ''}
                        onChange={(e) => handleQtyChange(idx, parseInt(e.target.value, 10) || 1)}
                        className="w-full text-center text-sm font-mono outline-none border-none py-1.5 focus:ring-0"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => handleQtyChange(idx, item.quantity + 1)}
                        className="px-2.5 py-2 text-gray-400 hover:text-gray-600 text-sm font-medium border-l border-gray-100 cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    {/* Actions - hide trash button if editing an individual pre-filed record */}
                    {!editingRecord && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDotRow(idx)}
                        disabled={dotQtys.length === 1}
                        className="p-2 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:pointer-events-none bg-white border border-gray-200 hover:border-red-100 rounded-lg transition-colors cursor-pointer"
                        title="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5" />
                <span>DoT is week and year: <b className="font-mono text-gray-600">1225</b> represents Week 12 of 2025.</span>
              </div>
            </div>

            {/* Global Error message */}
            {formError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Submit Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-gray-100 pt-4 gap-3">
              <div className="text-xs text-gray-500">
                Received quantity: <span className="font-bold font-mono text-gray-900">{displayTotalQty}</span> Tyres
              </div>
              
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-5 py-2.5 rounded-lg border border-indigo-700 transition-colors cursor-pointer shadow-sm shadow-indigo-100"
              >
                <Save className="h-4 w-4" />
                <span>
                  {isSaving
                    ? editingGroup || editingRecord
                      ? 'Updating Sheet...'
                      : 'Saving to Sheet...'
                    : editingGroup || editingRecord
                    ? 'Update Stock Details'
                    : 'Save Stock Details'}
                </span>
              </button>
            </div>
          </form>
        ) : (
          // =======================================================
          // OUTWARD TYRE SALE / REMOVAL FORM
          // =======================================================
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {liveStock.availableBrands.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
                <ShoppingCart className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-gray-700 mb-1">No Tyres Available in Stock</h4>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  You cannot record a sale when active stocks are empty. Please record billed inward stock first!
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Sale Date */}
                  <div className="relative">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-rose-500" />
                      <span>Date of Sale / Removal</span>
                    </label>
                    <input
                      type="date"
                      value={saleDate}
                      onChange={(e) => setSaleDate(e.target.value)}
                      className="w-full bg-white border border-gray-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm py-2 px-3 rounded-lg outline-none font-mono"
                      required
                    />
                  </div>

                  {/* Ref Slip / Invoice Number */}
                  <div className="relative">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                      <Receipt className="h-3 w-3 text-rose-500" />
                      <span>Sales Invoice No / Memo</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SOLD or SL-405"
                      value={saleInvoiceNo}
                      onChange={(e) => setSaleInvoiceNo(e.target.value)}
                      className="w-full bg-white border border-gray-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm py-2 px-3 rounded-lg outline-none uppercase font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Select Brand Option Dropdown */}
                  <div className="relative">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                      <Award className="h-3 w-3 text-rose-500" />
                      <span>Brand in Stock</span>
                    </label>
                    <select
                      value={saleBrand}
                      onChange={(e) => handleSaleBrandChange(e.target.value)}
                      className="w-full bg-white border border-gray-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm py-2.5 px-3 rounded-lg outline-none cursor-pointer"
                      required
                    >
                      <option value="">-- Choose Brand --</option>
                      {liveStock.availableBrands.map((bName) => (
                        <option key={bName} value={bName}>{bName}</option>
                      ))}
                    </select>
                  </div>

                  {/* Select Pattern Option Dropdown */}
                  <div className="relative">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                      <Tag className="h-3 w-3 text-rose-500" />
                      <span>Pattern / Size</span>
                    </label>
                    <select
                      value={salePattern}
                      onChange={(e) => handleSalePatternChange(e.target.value)}
                      disabled={!saleBrand}
                      className="w-full bg-white border border-gray-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm py-2.5 px-3 rounded-lg outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-mono"
                      required
                    >
                      <option value="">-- Select Pattern (size) --</option>
                      {saleBrand && liveStock.getPatternsForBrand(saleBrand).map((pat) => (
                        <option key={pat} value={pat}>{pat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* DOT & Quantities Sub-Form Group for Outward (Sales) */}
                {saleBrand && salePattern && (
                  <div className="bg-rose-50/10 rounded-xl p-4 border border-rose-100 mt-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                        <span>Weeks of Production & Quantities to Sell</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 font-mono">
                          {saleDotQtys.length} Row{saleDotQtys.length > 1 ? 's' : ''}
                        </span>
                      </h3>
                      
                      {/* Add dynamic check: do not allow adding multiple DOT rows when editing an individual single record */}
                      {!editingRecord && (
                        <button
                          type="button"
                          onClick={handleAddSaleDotRow}
                          className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-900 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Another DoT</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {saleDotQtys.map((item, idx) => {
                        const availableForDot = getMaxAvailableForDot(item.dot);
                        return (
                          <div key={idx} className="flex gap-3 items-center">
                            <span className="text-[10px] font-mono font-medium text-rose-400 w-6">
                              #{idx + 1}
                            </span>

                            {/* DoT Dropdown Selector */}
                            <div className="relative flex-1">
                              <select
                                value={item.dot}
                                onChange={(e) => handleSaleDotChange(idx, e.target.value)}
                                className="w-full bg-white border border-gray-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm py-2 px-3 rounded-lg outline-none cursor-pointer font-mono font-bold"
                                required
                              >
                                <option value="">-- Choose DOT --</option>
                                {currentAvailableDots.map((dObj) => (
                                  <option key={dObj.dot} value={dObj.dot}>
                                    DoT {dObj.dot} ({getMaxAvailableForDot(dObj.dot)} left)
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Quantity Selector */}
                            <div className="w-24 md:w-32 flex items-center border border-rose-200 bg-white rounded-lg">
                              <button
                                type="button"
                                onClick={() => handleSaleQtyChange(idx, item.quantity - 1, availableForDot)}
                                disabled={item.quantity <= 1 || !item.dot}
                                className="px-2.5 py-2 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:pointer-events-none text-sm font-medium border-r border-rose-100 cursor-pointer font-bold"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={availableForDot}
                                value={item.dot ? (item.quantity || '') : ''}
                                onChange={(e) => handleSaleQtyChange(idx, parseInt(e.target.value, 10) || 1, availableForDot)}
                                disabled={!item.dot}
                                className="w-full text-center text-sm font-mono outline-none border-none py-1.5 focus:ring-0 font-bold"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => handleSaleQtyChange(idx, item.quantity + 1, availableForDot)}
                                disabled={item.quantity >= availableForDot || !item.dot}
                                className="px-2.5 py-2 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:pointer-events-none text-sm font-medium border-l border-rose-100 cursor-pointer font-bold"
                              >
                                +
                              </button>
                            </div>

                            {/* Actions - hide trash button if editing an individual pre-filed record */}
                            {!editingRecord && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSaleDotRow(idx)}
                                disabled={saleDotQtys.length === 1}
                                className="p-2 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:pointer-events-none bg-white border border-gray-200 hover:border-red-100 rounded-lg transition-colors cursor-pointer"
                                title="Remove row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2 text-xs text-rose-600 flex items-center gap-1 font-semibold hover:text-rose-700">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Specify the exact active DoT and sale quantity per tyre. Multiple DoTs can be logged under this same size invoice.</span>
                    </div>
                  </div>
                )}

                {/* Global Error message */}
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Actions submit */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-gray-100 pt-4 gap-3 mt-4">
                  <div className="text-xs text-gray-500">
                    To be removed: <span className="font-bold font-mono text-rose-600">{displayTotalQty}</span> Unit{displayTotalQty > 1 ? 's' : ''}
                  </div>
                  
                  <button
                    type="submit"
                    disabled={isSaving || saleDotQtys.some((item) => !item.dot)}
                    className="inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:border-transparent px-5 py-2.5 rounded-lg border border-rose-700 transition-colors cursor-pointer shadow-sm shadow-rose-100"
                  >
                    {editingRecord ? <Save className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                    <span>
                      {isSaving 
                        ? 'Updating Sale...' 
                        : editingRecord 
                        ? 'Update Sale Record' 
                        : 'Record Sale (Deduct Stock)'}
                    </span>
                  </button>
                </div>
              </>
            )}

          </form>
        )}

      </div>
    </div>
  );
};
