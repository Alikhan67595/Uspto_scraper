import React, { useState, useEffect } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { downloadLeads, getValidKey, getMissingKey } from './download.js';

const TYPE_LABELS = {
    deadAbandoned: 'Dead Abandoned',
    deadCancelled: 'Dead Cancelled',
    livePending:   'Live Pending',
    liveRegister:  'Live Register',
};

const Settings = () => {
    const [activeType, setActiveType] = useState(null);
    const [counts, setCounts] = useState({});

    const types = ['deadAbandoned', 'deadCancelled', 'livePending', 'liveRegister'];

    const loadCounts = () => {
        const keys = types.flatMap(t => [getValidKey(t), getMissingKey(t)]);
        chrome.storage.local.get(keys, (res) => {
            const c = {};
            types.forEach(t => {
                c[t] = {
                    valid:   (res[getValidKey(t)]   || []).length,
                    missing: (res[getMissingKey(t)] || []).length,
                };
            });
            setCounts(c);
        });
    };

    useEffect(() => {
        const DEFAULT_TYPE = 'deadAbandoned';
        chrome.storage.local.get(['savedType'], (res) => {
            const saved = res.savedType ?? DEFAULT_TYPE;
            setActiveType(saved);
            if (!res.savedType) chrome.storage.local.set({ savedType: DEFAULT_TYPE });
        });

        loadCounts();

        const syncSettings = (changes, area) => {
            if (area !== 'local') return;
            if (changes.savedType) setActiveType(changes.savedType.newValue);
            const anyLeadChange = types.some(t =>
                changes[getValidKey(t)] || changes[getMissingKey(t)]
            );
            if (anyLeadChange) loadCounts();
        };

        chrome.storage.onChanged.addListener(syncSettings);
        return () => chrome.storage.onChanged.removeListener(syncSettings);
    }, []);

    const handleToggle = (selected) => {
        setActiveType(selected);
        chrome.storage.local.set({ savedType: selected });
        toast.success(`Switched to ${TYPE_LABELS[selected]}`, {
            position: "top-center",
            autoClose: 1000,
            hideProgressBar: true,
            closeButton: false,
            theme: "dark",
        });
    };

    const handleClear = (e, type) => {
        e.stopPropagation();
        if (!confirm(`Clear all data for ${TYPE_LABELS[type]}?`)) return;
        chrome.storage.local.set({
            [getValidKey(type)]: [],
            [getMissingKey(type)]: [],
        }, loadCounts);
    };

    const handleDownload = (e, type) => {
        e.stopPropagation();
        downloadLeads(type); // ← bas itna — sab kuch download.js mein hai
    };

    if (!activeType) return null;

    return (
        <div className="flex flex-col h-[400px] w-[300px] gap-[3px] p-[1px] bg-slate-900 border">
            <ToastContainer />
            {types.map((type) => (
                <div
                    key={type}
                    onClick={() => handleToggle(type)}
                    className={`flex items-center justify-between p-2 rounded-md select-none transition-all border h-[25%]
                        ${activeType === type ? 'bg-blue-600/20 border-blue-500' : 'bg-slate-800 border-transparent'}`}
                >
                    {/* Left — label + counts */}
                    <div className="flex flex-col gap-[2px]">
                        <span className={`text-[14px] font-semibold ${activeType === type ? 'text-blue-400' : 'text-slate-300'}`}>
                            {TYPE_LABELS[type]}
                        </span>
                        <span className="text-[10px] text-green-400">
                            ✅ {counts[type]?.valid ?? 0} Valid
                        </span>
                        <span className="text-[10px] text-yellow-400">
                            ⚠️ {counts[type]?.missing ?? 0} Missing Phone
                        </span>
                    </div>

                    {/* Right — toggle + buttons */}
                    <div className="flex flex-col gap-2 items-end">
                        {/* Toggle Switch */}
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${activeType === type ? 'bg-blue-500' : 'bg-slate-600'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all duration-300
                                ${activeType === type ? 'left-[19px]' : 'left-[2px]'}`}
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-row gap-1">
                            <button
                                onClick={(e) => handleDownload(e, type)}
                                className="px-3 py-1 bg-green-300 text-slate-900 rounded-[7px] cursor-pointer text-[10px] font-bold hover:bg-green-400"
                            >
                                Download
                            </button>
                            <button
                                onClick={(e) => handleClear(e, type)}
                                className="px-3 py-1 bg-red-300 text-slate-900 rounded-[7px] cursor-pointer text-[10px] font-bold hover:bg-red-400"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default Settings;