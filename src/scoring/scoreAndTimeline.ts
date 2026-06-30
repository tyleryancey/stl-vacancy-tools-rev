// Faithful TypeScript port of the original in-browser scoring engine
// (REVERSE-ENGINEERING.md §7). Pure/framework-free: it builds a normalized event
// timeline from live city data, runs the "open valve" scoring loop newest→oldest,
// applies the Forestry (+75 vacancy) and LRA (+70 burden) kickers, caps each score
// at 100, and returns per-category totals + the contributing events for the UI.
import {
  CSB_VACANCY_INDICATORS,
  CSB_NUISANCE_INDICATORS,
  diminish,
  vacancyVerbal,
  magnitudeVerbal,
} from "./constants";
import type { CityData } from "./cityData";

const MONTH = 1000 * 60 * 60 * 24 * 30.4;
const YEAR = 1000 * 60 * 60 * 24 * 365.25;

export interface TimelineEvent {
  date: number;
  category: string;
  type: string;
  desc: string;
  amt?: number;
  est?: number;
  vacancyIndicator?: "strong" | true;
  nuisanceIndicator?: boolean;
  openings?: number;
}

export interface Contribution {
  category: string;
  type: string;
  amount: number;
}

export interface ScoreCategory {
  total: number;
  verbal: string;
  count: number;
}

export interface ScoreResult {
  vacancy: ScoreCategory;
  burden: ScoreCategory;
  nuisance: ScoreCategory;
  tax: ScoreCategory;
  vacant: boolean;
  vacantFactors: string[];
  condemned: boolean;
  taxYrsDel: number;
  taxAmt: number;
  forestryType: string | false;
  anyScore: boolean;
  timeline: TimelineEvent[];
  contributions: {
    vacancy: Contribution[];
    burden: Contribution[];
    nuisance: Contribution[];
    tax: Contribution[];
  };
}

export interface ScoreParcel {
  Type: string;
  OwnerName?: string;
  Handle?: string;
  ParcelId?: string;
  IsLra?: boolean;
  IsLcra?: boolean;
}

// 48-month vacancy-score history, reproduced the way the original's Node batch
// built `VacTimeline` (§7.1): re-run the scorer "as of" each past month via the
// backDate path. Returns 48 totals, oldest (47 months ago) → newest (now).
export function vacancyTimeline(data: CityData, parcel: ScoreParcel, now: number = Date.now()): number[] {
  const out: number[] = [];
  for (let i = 47; i >= 0; i--) {
    out.push(scoreAndTimeline(data, parcel, now - i * MONTH).vacancy.total);
  }
  return out;
}

export function scoreAndTimeline(
  data: CityData,
  parcel: ScoreParcel,
  now: number = Date.now()
): ScoreResult {
  const isLra = data.IsLra === true || parcel.IsLra === true;
  const isLcra = data.IsLcra === true || parcel.IsLcra === true;
  let vacant = false;
  const vacantFactors: string[] = [];

  if (isLra || isLcra) {
    vacant = true;
    vacantFactors.push(`Owned by ${isLra ? "LRA" : "LCRA"}`);
  }
  const vbi = data.VacantBuildingInfo;
  if (vbi && vbi.length && vbi[vbi.length - 1]?.VacancyStatus === "active") {
    vacant = true;
    vacantFactors.push("On Vacant Building Registry");
  }

  const timeline: TimelineEvent[] = [];

  // --- Build the timeline from each city-data array (§7.4) ---
  for (const e of data.GeneralConstructionPermits ?? []) {
    timeline.push({
      date: new Date(e.ApplicationDate).getTime(),
      category: "Permit",
      type: "Construction",
      est: e.ProjectCost,
      desc: `$${e.ProjectCost?.toLocaleString() ?? 0} ${e.PermitType}: ${e.DescriptionOfWork}`,
    });
  }
  for (const e of data.PlumbingMechanicalElectrical ?? []) {
    const type = e.AppType === "AP" ? "Plumbing" : e.AppType === "AE" ? "Electrical" : e.AppType === "AM" ? "Mechanical" : e.AppType;
    const est = e.EstProjectCost != null ? e.EstProjectCost : "";
    timeline.push({
      date: new Date(e.AppDate).getTime(),
      category: "Permit",
      type,
      est: typeof est === "number" ? est : undefined,
      desc: typeof est === "number" ? `$${est.toLocaleString()}` : "",
    });
  }

  let taxYrsDel = 0;
  let openDel = true;
  for (const e of data.TaxHistory ?? []) {
    if (e.TaxBal > 0) {
      timeline.push({
        category: "Tax",
        date: new Date("" + (e.TaxYear + 1)).getTime(),
        type: "Unpaid",
        desc: "",
        amt: e.TaxBal,
      });
      if (openDel) taxYrsDel++;
    } else openDel = false;
  }

  for (const e of data.DemolitionPermits ?? []) {
    let desc = "Still open";
    if (e.DPMT_DateClosed !== null) desc = "Closed " + e.DPMT_DateClosed.split("T")[0];
    if (e.DPMT_StructureDescription !== null) desc += "; " + e.DPMT_StructureDescription;
    if (e.DPMT_IsResultVacantLot) desc += " - result is a vacant lot";
    timeline.push({ category: "Demolition", date: new Date(e.DPMT_DateCreated).getTime(), type: "Permitted", desc });
  }

  let commInspection = false;
  for (const e of data.CommercialOccupancyInspections ?? []) {
    commInspection = true;
    timeline.push({
      category: "Inspection",
      type: "Commercial Occupancy",
      date: new Date(e.CurrentResultDate || e.ApplicationDate || "").getTime(),
      desc: `Permit ${e.CurrentResult} (${e.BusinessType ?? ""})`,
    });
  }

  for (const insp of data.HCESInspections ?? []) {
    let type = insp.InspectionType.replace(/^ES - /, "").replace(/^ES /, "").replace(/HCD/, "Conservation District");
    type = type.replace(/Housing Conservation/g, "Occupancy");
    let desc = insp.CurrentResult;
    const event: TimelineEvent = {
      date: new Date(insp.CreatedDate).getTime(),
      category: "Inspection",
      type,
      desc,
    };
    if (desc.indexOf("Condemnation") !== -1) event.vacancyIndicator = "strong";
    const violations = insp.Violations ?? [];
    if (insp.InspectionType.indexOf("ES - ") !== -1 && violations.length > 0) {
      let minor = 0, major = 0;
      for (const v of violations) {
        if (v.ViolationSeverity === "Minor") minor++;
        else if (v.ViolationSeverity === "Major") major++;
      }
      if (major || minor) {
        desc += `: ${major ? major + " major" : ""}${major && minor ? " & " : ""}${minor ? minor + " minor" : ""} violation${major + minor > 1 ? "s" : ""}`;
        event.desc = desc;
      }
    }
    timeline.push(event);
  }

  const forestryType = data.ForestryMaintenance?.PropertyType ?? false;
  for (const e of data.ForestryMaintenance?.Services ?? []) {
    if (e.ServiceType != null) {
      const st = typeof e.ServiceType === "string" ? e.ServiceType : e.ServiceType[0];
      timeline.push({
        date: new Date(e.ServiceDate).getTime(),
        category: "Forestry",
        amt: parseInt(String(e.ServiceAmount), 10) || 0,
        type: `${e.PropertyType} ${st}`.replace(/Grass Maint|Weed-Grass/gi, "cut").replace(/Building/gi, "bldg"),
        desc: "",
      });
    }
  }

  for (const e of data.ServiceRequests ?? []) {
    const isVac = CSB_VACANCY_INDICATORS.indexOf(e.PROBLEMCODE) !== -1;
    const isNui = CSB_NUISANCE_INDICATORS.indexOf(e.PROBLEMCODE) !== -1;
    if (isVac || isNui) {
      const event: TimelineEvent = {
        date: new Date(e.DATETIMEINIT).getTime(),
        category: "CSB",
        type: e.DESCRIPTION,
        desc: "",
      };
      if (isVac) event.vacancyIndicator = true;
      if (isNui) event.nuisanceIndicator = true;
      timeline.push(event);
    }
  }

  for (const e of vbi ?? []) {
    if (e.VacancyStatus === "inactive") continue;
    let vios = "";
    if (e.Violations.length > 0) {
      let minor = 0, major = 0;
      for (const v of e.Violations) {
        if (v.Severity === "Minor") minor++;
        else if (v.Severity === "Major") major++;
      }
      if (major || minor) vios = `${major ? major + " major" : ""}${major && minor ? " & " : ""}${minor ? minor + " minor" : ""} violation${major + minor > 1 ? "s" : ""}`;
    }
    if (e.VacancyEntryModified !== e.VacancyEntryCreated) {
      timeline.push({ category: "Vacant Bldg", date: new Date(e.VacancyEntryModified).getTime(), type: "Updated", desc: vios });
      vios = "";
    }
    timeline.push({ category: "Vacant Bldg", date: new Date(e.VacancyEntryCreated).getTime(), type: "Added to registry", desc: vios });
    for (const i of e.Invoices) {
      timeline.push({
        date: new Date(i.Created).getTime(),
        category: "Vacant Bldg",
        type: `$${i.CurrentFee} ${i.FeeDescription.replace(/Vacant Building /g, "")}`,
        desc: "",
        amt: parseInt(String(i.CurrentFee), 10) || 0,
      });
    }
  }

  for (const e of data.BuildingDivisionBoardUps ?? []) {
    timeline.push({
      date: new Date(e["Date Boarded Up"]).getTime(),
      category: "Board up",
      type: `${e["Number of Openings"]} openings`,
      desc: "",
      vacancyIndicator: "strong",
      nuisanceIndicator: true,
      openings: parseInt(String(e["Number of Openings"]), 10) || 0,
    });
  }

  // Sort newest-first, drop NaN dates, then de-dupe identical adjacent events
  timeline.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  for (let i = timeline.length - 1; i >= 1; i--) {
    const a = timeline[i - 1], b = timeline[i];
    if (a.date === b.date && a.category === b.category && a.type === b.type && a.desc === b.desc && a.amt === b.amt) {
      timeline.splice(i, 1);
    }
  }

  // --- Scoring loop (open-valve model, §7.5) ---
  const score = {
    vacancy: { total: 0, open: true, count: 0 },
    nuisance: { total: 0, open: true, count: 0 },
    tax: { total: 0, open: true, count: 0 },
    burden: { total: 0, open: true, count: 0 },
    boardUpCount: 0,
    permitTotal: 0,
    ownerChange: false,
    occupancyPermit: false,
    occupancyPermitAge: false as number | false,
    inspectionComplied: false,
  };
  const contributions = { vacancy: [] as Contribution[], burden: [] as Contribution[], nuisance: [] as Contribution[], tax: [] as Contribution[] };
  let condemned = false;
  let taxAmt = 0;

  let prior = { date: 0, category: "", type: "", desc: "" };

  for (const event of timeline) {
    if (!Number.isFinite(event.date) || event.date > now) continue;
    const monthsAgo = Math.trunc((now - event.date) / MONTH);
    if (prior.date === event.date && prior.category === event.category && prior.type === event.type && prior.desc === event.desc) continue;
    prior = { date: event.date, category: event.category, type: event.type, desc: event.desc };

    if (event.category === "Ownership" && event.type === "Sale of Property") score.ownerChange = true;

    // Valve shutoffs
    if (event.category === "Inspection") {
      if ((event.type === "Complaint" || event.type === "Housing Conservation") && (event.desc.indexOf("Complied") !== -1 || event.desc.indexOf("Abated") !== -1)) {
        score.inspectionComplied = true;
      }
      if (event.type === "Occupancy" && event.desc.indexOf("Certificate Issued") !== -1) {
        score.occupancyPermit = true;
        if (score.occupancyPermitAge === false) score.occupancyPermitAge = (now - event.date) / (1000 * 60 * 60 * 24 * 30.25);
        score.vacancy.open = false;
        score.nuisance.open = false;
      } else if (event.type === "Commercial Occupancy" && event.desc.indexOf("Permit Issued") !== -1) {
        score.occupancyPermit = true;
        if (score.occupancyPermitAge === false) score.occupancyPermitAge = (now - event.date) / (1000 * 60 * 60 * 24 * 30.25);
        score.vacancy.open = false;
        score.nuisance.open = false;
      } else if (event.type === "Complaint" && (event.desc.indexOf("Demo Complete") !== -1 || event.desc.indexOf("Building Demolished") !== -1)) {
        score.vacancy.open = false;
        score.nuisance.open = false;
      }
    } else if (event.category === "Demolition" && event.desc.indexOf("result is a vacant lot") !== -1) {
      score.vacancy.open = false;
      score.nuisance.open = false;
    }

    if (event.category === "Permit" && score.boardUpCount === 0) score.permitTotal += event.est ?? 0;

    // Vacancy
    if (event.vacancyIndicator !== undefined && score.vacancy.open) {
      let amount = 25;
      if (event.vacancyIndicator === "strong") amount = 75;
      if (parcel.Type === "Empty Lot" && event.category === "Inspection") amount = 0;
      if ((event.type === "Complaint" || event.type === "Housing Conservation") && score.inspectionComplied) amount = 0;

      let vacancyScore: number;
      if (event.category === "Board up" && parcel.Type !== "Empty Lot") {
        if (score.permitTotal < 10000) {
          score.boardUpCount += 1;
          vacancyScore = (1 / score.boardUpCount) * amount;
        } else vacancyScore = 0;
      } else if (event.desc.indexOf("Condemnation") !== -1) {
        vacancyScore = amount;
      } else {
        vacancyScore = diminish(amount, monthsAgo);
      }
      if ((event.category === "Forestry" || event.category === "CSB") && score.ownerChange) vacancyScore = 0;

      if (vacancyScore > 2) {
        if (event.desc.indexOf("Condemnation") !== -1) {
          condemned = true;
          vacant = true;
          if (!vacantFactors.includes("Condemned without occupancy permit")) vacantFactors.push("Condemned without occupancy permit");
        }
        const type = event.desc.indexOf("Structural Condemnation") !== -1 ? "Struct. Condemnation" : event.type;
        contributions.vacancy.push({ category: event.category, type, amount: vacancyScore });
        score.vacancy.total += vacancyScore;
        score.vacancy.count += 1;
      }
    }

    // Nuisance (and shared burden)
    if (event.nuisanceIndicator !== undefined && score.nuisance.open) {
      let nuisanceScore = diminish(20, monthsAgo);
      if ((event.category === "Forestry" || event.category === "CSB") && score.ownerChange) nuisanceScore = 0;
      if (nuisanceScore > 2) {
        const type = event.type.replace(/Vacant bldg |Vacnt |Code-|Vacant Lot /gi, "");
        contributions.burden.push({ category: event.category, type, amount: nuisanceScore });
        score.burden.total += nuisanceScore;
        score.burden.count += 1;
        contributions.nuisance.push({ category: event.category, type, amount: nuisanceScore });
        score.nuisance.total += nuisanceScore;
        score.nuisance.count += 1;
      }
    } else if (
      event.category === "Inspection" && !score.inspectionComplied && score.nuisance.open &&
      (event.type === "Complaint" || event.type === "Door to Door") && event.desc.indexOf(" major ") !== -1
    ) {
      const qualified = ["Fee Letter", "Non-Compliance", "Violation Letter", "Referred to Court", "Condemned", "Structural Condemnation"];
      if (qualified.some((q) => event.desc.indexOf(q) === 0)) {
        const violations = parseInt(event.desc.split(": ")[1].split(" major ")[0], 10);
        let amount = Math.log(violations) * 20;
        if (violations === 1) amount = 11;
        const nuisanceScore = diminish(amount, monthsAgo / 3);
        if (nuisanceScore > 2) {
          const label = `${violations} major code violations`;
          contributions.burden.push({ category: event.category, type: label, amount: nuisanceScore });
          score.burden.total += nuisanceScore;
          score.burden.count += 1;
          contributions.nuisance.push({ category: event.category, type: label, amount: nuisanceScore });
          score.nuisance.total += nuisanceScore;
          score.nuisance.count += 1;
        }
      }
    } else if (event.category === "Tax" && event.amt !== undefined) {
      if (!score.ownerChange) taxAmt += Math.round(event.amt);
      const taxScore = 25;
      contributions.tax.push({ category: "Tax", type: "Unpaid", amount: taxScore });
      score.tax.total += taxScore;
      score.tax.count += 1;
      const burdenScore = parseInt(String(4 + event.amt / 50), 10);
      if (burdenScore > 2) {
        contributions.burden.push({ category: "Tax", type: `Unpaid $${Math.trunc(event.amt)}`, amount: burdenScore });
        score.burden.total += burdenScore;
        score.burden.count += 1;
      }
    } else if (event.amt !== undefined) {
      const cat = event.category.replace(/Vacant Bldg/g, "VacBldg");
      void cat; void YEAR;
      let amount = parseInt(String(1 + event.amt / 30), 10);
      if (event.category === "Forestry" && forestryType !== false && (forestryType === "Vacant Lot" || forestryType.indexOf(" VL") !== -1)) amount = amount * 1.666;
      let nuisanceScore = diminish(amount, monthsAgo);
      if ((event.category === "Forestry" || event.category === "CSB") && score.ownerChange) nuisanceScore = 0;
      if (nuisanceScore > 2) {
        const type = `${event.type.replace(/Vacant bldg |Vacnt |Vacant Lot /gi, "")} $${Math.trunc(event.amt)}`;
        contributions.burden.push({ category: event.category, type, amount: nuisanceScore });
        score.burden.total += nuisanceScore;
        score.burden.count += 1;
        contributions.nuisance.push({ category: event.category, type, amount: nuisanceScore });
        score.nuisance.total += nuisanceScore;
        score.nuisance.count += 1;
      }
    }
  }

  // Forestry "vacant" kicker: +75 vacancy
  if (
    (score.occupancyPermit === false || (score.occupancyPermit === true && (score.occupancyPermitAge as number) > 8)) &&
    forestryType !== false &&
    (forestryType.indexOf("Vacant") !== -1 || forestryType.indexOf(" VB") !== -1 || forestryType.indexOf(" VL") !== -1)
  ) {
    contributions.vacancy.unshift({ category: "Forestry", type: "Marked vacant by Forestry", amount: 75 });
    score.vacancy.total += 75;
  }

  // LRA/LCRA burden kicker: +70 burden
  if ((isLra || isLcra) && score.burden.total < 100) {
    contributions.burden.unshift({ category: "LRA", type: "Confirmed vacant", amount: 70 });
    score.burden.total += 70;
  }

  // Cap, round, verbal band
  const finalize = (cat: { total: number; count: number }, kind: "vacancy" | "other"): ScoreCategory => {
    let total = cat.total > 100 ? 100 : cat.total;
    total = Math.round(total);
    const verbal = kind === "vacancy" ? vacancyVerbal(total) : magnitudeVerbal(total);
    return { total, verbal, count: cat.count };
  };

  const vacancy = finalize(score.vacancy, "vacancy");
  const burden = finalize(score.burden, "other");
  const nuisance = finalize(score.nuisance, "other");
  const tax = finalize(score.tax, "other");

  if (vacant) {
    vacancy.total = 100;
    vacancy.verbal = "Definite";
  }

  const anyScore = vacancy.total > 0 || burden.total > 0 || nuisance.total > 0 || tax.total > 0 || taxYrsDel > 0;

  void commInspection;
  return {
    vacancy, burden, nuisance, tax,
    vacant, vacantFactors, condemned, taxYrsDel, taxAmt, forestryType, anyScore,
    timeline, contributions,
  };
}
