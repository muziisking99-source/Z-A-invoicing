import { useState } from "react";

/** Round money to 2 decimal places. */
export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatMoneyInput(n: number) {
  return String(roundMoney(n));
}

function isFilledPrice(value: string) {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) && n > 0;
}

/**
 * Resolve unit/case pair for save.
 * Unit only → case = unit × pack.
 * Case only → unit = case ÷ pack.
 * Both → keep both. Neither → 0 / 0.
 */
export function resolveUnitCasePair(unitStr: string, caseStr: string, pack: number) {
  const safePack = Math.max(1, Math.floor(Number(pack)) || 1);
  const unitNum = Number(unitStr);
  const caseNum = Number(caseStr);
  const unitFilled = isFilledPrice(unitStr);
  const caseFilled = isFilledPrice(caseStr);

  if (unitFilled && caseFilled) {
    return { unit: roundMoney(unitNum), casePrice: roundMoney(caseNum) };
  }
  if (unitFilled) {
    return { unit: roundMoney(unitNum), casePrice: roundMoney(unitNum * safePack) };
  }
  if (caseFilled) {
    return { unit: roundMoney(caseNum / safePack), casePrice: roundMoney(caseNum) };
  }
  return { unit: 0, casePrice: 0 };
}

export function deriveCaseFromUnit(unitStr: string, pack: number): string {
  if (!isFilledPrice(unitStr)) return "";
  const safePack = Math.max(1, Math.floor(Number(pack)) || 1);
  return formatMoneyInput(Number(unitStr) * safePack);
}

export function deriveUnitFromCase(caseStr: string, pack: number): string {
  if (!isFilledPrice(caseStr)) return "";
  const safePack = Math.max(1, Math.floor(Number(pack)) || 1);
  return formatMoneyInput(Number(caseStr) / safePack);
}

export type UnitCaseFields = {
  unit: string;
  casePrice: string;
  unitTouched: boolean;
  caseTouched: boolean;
  setUnit: (value: string) => void;
  setCasePrice: (value: string) => void;
  onUnitChange: (value: string, pack: string) => void;
  onCaseChange: (value: string, pack: string) => void;
  onPackChange: (pack: string) => void;
  reset: (unit?: string, casePrice?: string) => void;
  resolved: (pack: string) => { unit: number; casePrice: number };
};

/** Bidirectional unit ↔ case price fields for product forms. */
export function useUnitCaseFields(
  initialUnit = "",
  initialCase = "",
): UnitCaseFields {
  const [unit, setUnit] = useState(initialUnit);
  const [casePrice, setCasePrice] = useState(initialCase);
  const [unitTouched, setUnitTouched] = useState(isFilledPrice(initialUnit));
  const [caseTouched, setCaseTouched] = useState(isFilledPrice(initialCase));

  const onUnitChange = (value: string, pack: string) => {
    setUnit(value);
    setUnitTouched(true);
    if (!caseTouched) {
      setCasePrice(deriveCaseFromUnit(value, Number(pack)));
    }
  };

  const onCaseChange = (value: string, pack: string) => {
    setCasePrice(value);
    setCaseTouched(true);
    if (!unitTouched) {
      setUnit(deriveUnitFromCase(value, Number(pack)));
    }
  };

  const onPackChange = (pack: string) => {
    if (unitTouched && !caseTouched) {
      setCasePrice(deriveCaseFromUnit(unit, Number(pack)));
      return;
    }
    if (caseTouched && !unitTouched) {
      setUnit(deriveUnitFromCase(casePrice, Number(pack)));
      return;
    }
    if (!unitTouched && !caseTouched) {
      if (isFilledPrice(unit) && !isFilledPrice(casePrice)) {
        setCasePrice(deriveCaseFromUnit(unit, Number(pack)));
      } else if (isFilledPrice(casePrice) && !isFilledPrice(unit)) {
        setUnit(deriveUnitFromCase(casePrice, Number(pack)));
      }
    }
  };

  const reset = (nextUnit = "", nextCase = "") => {
    setUnit(nextUnit);
    setCasePrice(nextCase);
    setUnitTouched(isFilledPrice(nextUnit));
    setCaseTouched(isFilledPrice(nextCase));
  };

  const resolved = (pack: string) => resolveUnitCasePair(unit, casePrice, Number(pack));

  return {
    unit,
    casePrice,
    unitTouched,
    caseTouched,
    setUnit,
    setCasePrice,
    onUnitChange,
    onCaseChange,
    onPackChange,
    reset,
    resolved,
  };
}
