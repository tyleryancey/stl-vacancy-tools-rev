// Live St. Louis city parcel data from vcpp.stldata.org (the scoring engine's
// input, REVERSE-ENGINEERING.md §7.2). CORS is open (Access-Control-Allow-Origin:*),
// so the browser fetches it directly. The original falls back to a Cloud Function
// on timeout; we have no such proxy, so on failure we return null and the UI degrades.

const CITY_DATA_BASE =
  import.meta.env.VITE_CITY_DATA_BASE || "https://vcpp.stldata.org/parcel_data/";

export interface CityTax {
  TaxYear: number;
  TaxBal: number;
  TaxAmt: number;
  AmtPaid: number;
}
export interface CityViolation {
  ViolationSeverity?: string;
  Severity?: string;
}
export interface CityData {
  IsLra?: boolean;
  IsLcra?: boolean;
  GeneralConstructionPermits?: Array<{
    ApplicationDate: string;
    ProjectCost: number;
    PermitType: string;
    DescriptionOfWork: string;
  }>;
  PlumbingMechanicalElectrical?: Array<{
    AppDate: string;
    EstProjectCost?: number | null;
    AppType: string;
  }>;
  TaxHistory?: CityTax[];
  DemolitionPermits?: Array<{
    DPMT_DateCreated: string;
    DPMT_DateClosed: string | null;
    DPMT_StructureDescription: string | null;
    DPMT_IsResultVacantLot?: boolean;
  }>;
  CommercialOccupancyInspections?: Array<{
    CurrentResultDate?: string;
    ApplicationDate?: string;
    CurrentResult: string;
    BusinessType?: string;
  }>;
  HCESInspections?: Array<{
    CreatedDate: string;
    InspectionType: string;
    CurrentResult: string;
    Violations?: CityViolation[];
  }>;
  ForestryMaintenance?: {
    PropertyType?: string;
    Services?: Array<{
      ServiceType: string | string[] | null;
      ServiceDate: string;
      ServiceAmount: number | string;
      PropertyType: string;
    }>;
  };
  ServiceRequests?: Array<{
    PROBLEMCODE: string;
    DATETIMEINIT: string;
    DESCRIPTION: string;
    SUBMITTO: string;
  }>;
  VacantBuildingInfo?: Array<{
    VacancyStatus: string;
    VacancyEntryCreated: string;
    VacancyEntryModified: string;
    Violations: CityViolation[];
    Invoices: Array<{ Created: string; CurrentFee: number; FeeDescription: string }>;
  }>;
  BuildingDivisionBoardUps?: Array<{
    "Date Boarded Up": string;
    "Number of Openings": number | string;
  }>;
  [key: string]: unknown;
}

export async function fetchCityData(
  parcelId: string,
  timeoutMs = 8000
): Promise<CityData | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(CITY_DATA_BASE + parcelId, { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as CityData;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}
