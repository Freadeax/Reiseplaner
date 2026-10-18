/* Reiseplaner · Start: Laden, Schnittstelle window.__app, Routing, Service Worker.
   Teil 18 von 18 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Start ================= */
Store.loadLocal();Store.bootBackend();
window.__app={sheetTabTarget,sheetKeydown,openSheet,closeSheet,checklistView,tCheck,moduleGuide,areaPicker,MODULE_INFO,APPEARANCES,appearanceValue,applyAppearance,appearanceSheet,vReisen,vReise,routeCalc,routeApply,routePoints,routeBlock,tzOffsetMin,zonedToUtc,tzDiffMin,validTz,outboundMin,favMerge,favExportData,favText,favClean,transferGaps,actGeo,arrivalMin,slotForTime,timeMin,sortedItems,activityGaps,catCompareSheet,planningNextSteps,nextStepsBlock,openHoursText,costEntryFromForm,costEntryPreview,applyCostEntry,stayChangePreview,applyStayChange,protectedPlanChange,catOpenById,catShareUrl,reorderLegs,legStarts,legsBlock,activityCommitted,activityChangePreview,applyActivityChange,catYear,customActFromForm,tUnternehmen,catComboBlock,rainSwap,dayLoad,driveByDay,dayRouteUrl,swapDays,planFillApply,catTourPlan,catFavs,catFavToggle,catFind,catMap,catSeasonStrip,actHours,stayCommitted,commitmentIssues,savingPreview,applySavingPreview,sheetSaving,costScenarios,scenarioSection,tKosten,catalogQuery,catApply,catTripType,catState,vEntdecken,actCost,openCosts,Sync,Auth,guestPreview,adoptGuestTrips,tripSyncState,guestPendingCount,vKonto,conflictBlock,validateLedger,ledgerRows,financeSummary,setLedger,ledgerSection,sampleAge,stayNight,tripSeason,seasonOfMd,PRICE_SAMPLES,encryptBackup,decryptBackup,validateSecureBackup,importPreview,readBackupFile,hasBackupCrypto,MAX_BACKUP_BYTES,MAX_SECURE_FILE_BYTES,holidayStay,planBasis,TEMPLATES,applyType,providerUrl,searchDefaults,searchState,offerAmounts,offerCurrent,offerEvaluation,filteredOffers,validateOffer,validateSearch,migrateTrip,activeOffer,tSuche,comparisonTable,applyOffer,offerForecast,offerFinance,PROVIDERS,rainIdeas,fitsDay,tripPhase,phaseText,icsData,icsFold,tripText,todayBlock,tMappe,backupData,validateBackup,importTrips,setField,pd,routeKm,resetStay,openCosts,actCost,Store,UI,cost,checks,checklist,savingTips,PKGS,ACTS,STAYS,PLACES,silvesterTemplate,applyPkg,newTrip,go,daysOf,nightsOf,render};
Object.assign(window.__app,{tripShelf,tripShelfTools,tripSpotlight,SHELF_FILTERS});
Object.assign(window.__app,{dayCosts,freeSlots,activityList,actCost,NOTE_BLOCKS,notesLinks,notesPhones,notesHas,addNoteBlock,notesExtras,tNotiz,budgetCheck,budgetSection});
Object.assign(window.__app,{routeEndpointPreview,applyRouteEndpointChange,invalidateEndpointRoute});
Object.assign(window.__app,{catPlaceRaw,catSpotPlace,catLoadForQuery,catLoadIndex,financeEntry,cancelEntry,addRefund,uncancel,setTransport,validateExtras,openCosts,serverRowProblem,V3_EDIT,v3Banner,validateV3,toServer,TEMPLATES,TPL_CHECKS,tplTrip,departurePlan,departureBlock,serverRowProblem,unreadableList,unreadableBlock,unreadableShelf});
Object.assign(window.__app,{AREA_GROUPS,planDayPicker});
Object.assign(window.__app,{catReadProfile,catProfile,catProfileChange,catSetMood,catPreset,catMoodPanel,catRank,catReasons,catSearch});
Object.assign(window.__app,{catWishItems,catDropWish,catClearProfile,catUndoProfile,catProfileSummary,catResultView,catProfileRows,catInvalidateSearch,catSetOrigin});
Object.assign(window.__app,{catMoodKeys});
Object.assign(window.__app,{v3CanEdit,v3Actions,v3TransportBlock,v3Controller,v3EditorOpen,v3Sheet});
Object.assign(window.__app,{V3_JOURNAL,journalValidate,journalCanEdit,journalHas,journalDays,journalLayout,journalActs,journalSlot,journalSection,journalRetro,journalToday,journalMappe,journalMappeToggle,journalSheet,journalSave,journalRate,journalConfirm,journalCommit,journalKeep}); /* Reisetagebuch und Bewertungen */
Object.assign(window.__app,{historyTrips,keyPriceOpen,journalLostDrafts,v3Ref}); /* Review Runde 2 */
Object.assign(window.__app,{ledgerBalanceText});
Object.assign(window.__app,{TEMPLATE_GROUPS,templateGroups,tplButtons,templatePreview,templatePreviewHtml,sheetTemplate,commitTemplatePreview});
Object.assign(window.__app,{catDbAll,catalogQuery,CAT_RANK_MAX});
Object.assign(window.__app,{V3S,splitValidate,splitPostings,splitResult,splitSection,splitRetro,splitCheck,splitCandidate,splitPreview,splitController,splitForm,splitSheet});
Object.assign(window.__app,{NAV_DEF,runningTrips,navItems,navActive,navHtml,renderNav,navFocus,heuteLinks,vHeute,memoriesData,vErinnerungen,kontoDarstellung}); /* Navigation P0.5 */
Object.assign(window.__app,{MAX_TRIP_DAYS,tripDayCount,tripTooLong,tripLengthError,viewDays,longTripNote}); /* Reisedauer, Paket 1 */
Object.assign(window.__app,{sheetDragDecision,sheetGripBind,fieldHidden,keepFieldVisible}); /* P0.5 iOS-Gestaltungsregeln */
go(location.hash||'reisen',true);
Auth.start().catch(e=>console.error('Reiseplaner: Kontoanbindung',e));
/* Offline-Start nur bei Auslieferung über http(s); als Datei geöffnet bleibt alles wie bisher. */
try{if(typeof navigator!=='undefined'&&navigator.serviceWorker&&typeof location!=='undefined'&&/^https?:$/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))}catch(e){}
