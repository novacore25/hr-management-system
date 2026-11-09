"use client";

import { useEffect, useState } from "react";

interface WilayahItem {
  id: string;
  name: string;
}

interface WilayahCascadingSelectProps {
  province: string | null;
  city: string | null;
  district: string | null;
  village: string | null;
  postalCode: string | null;
  onChange: (patch: {
    province?: string;
    city?: string;
    district?: string;
    village?: string;
    postalCode?: string;
  }) => void;
  selectClassName?: string;
  inputClassName?: string;
  labelClassName?: string;
}

function matchRegionName(apiName: string, targetName: string | null | undefined): boolean {
  if (!targetName) return false;
  const a = apiName.trim().toUpperCase();
  const b = targetName.trim().toUpperCase();
  if (a === b) return true;
  const cleanA = a.replace(/^(KOTA|KABUPATEN|KAB\.|KECAMATAN|KELURAHAN|DESA)\s+/, "");
  const cleanB = b.replace(/^(KOTA|KABUPATEN|KAB\.|KECAMATAN|KELURAHAN|DESA)\s+/, "");
  return cleanA === cleanB;
}

export function WilayahCascadingSelect({
  province,
  city,
  district,
  village,
  postalCode,
  onChange,
  selectClassName = "ab-select text-xs w-full",
  inputClassName = "ab-input text-xs w-full",
  labelClassName = "text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1",
}: WilayahCascadingSelectProps) {
  const [provinces, setProvinces] = useState<WilayahItem[]>([]);
  const [regencies, setRegencies] = useState<WilayahItem[]>([]);
  const [districts, setDistricts] = useState<WilayahItem[]>([]);
  const [villages, setVillages] = useState<WilayahItem[]>([]);

  const [selectedProvId, setSelectedProvId] = useState<string>("");
  const [selectedRegId, setSelectedRegId] = useState<string>("");
  const [selectedDistId, setSelectedDistId] = useState<string>("");
  const [selectedVillName, setSelectedVillName] = useState<string>("");

  // 1. Fetch provinces
  useEffect(() => {
    fetch("/api/wilayah/provinces.json")
      .then((res) => res.json())
      .then((data: WilayahItem[]) => {
        if (Array.isArray(data)) setProvinces(data);
      })
      .catch(() => {});
  }, []);

  // Sync selectedProvId dari prop province
  useEffect(() => {
    if (provinces.length > 0 && province) {
      const match = provinces.find((p) => matchRegionName(p.name, province));
      if (match) setSelectedProvId(match.id);
    } else if (!province) {
      setSelectedProvId("");
    }
  }, [provinces, province]);

  // Fetch regencies saat selectedProvId berubah
  useEffect(() => {
    if (!selectedProvId) {
      setRegencies([]);
      return;
    }
    fetch(`/api/wilayah/regencies/${selectedProvId}.json`)
      .then((res) => res.json())
      .then((data: WilayahItem[]) => {
        if (!Array.isArray(data)) {
          setRegencies([]);
          return;
        }
        setRegencies(data);
        if (city) {
          const match = data.find((r) => matchRegionName(r.name, city));
          if (match) setSelectedRegId(match.id);
        }
      })
      .catch(() => setRegencies([]));
  }, [selectedProvId, city]);

  // Fetch districts saat selectedRegId berubah
  useEffect(() => {
    if (!selectedRegId) {
      setDistricts([]);
      return;
    }
    fetch(`/api/wilayah/districts/${selectedRegId}.json`)
      .then((res) => res.json())
      .then((data: WilayahItem[]) => {
        if (!Array.isArray(data)) {
          setDistricts([]);
          return;
        }
        setDistricts(data);
        if (district) {
          const match = data.find((d) => matchRegionName(d.name, district));
          if (match) setSelectedDistId(match.id);
        }
      })
      .catch(() => setDistricts([]));
  }, [selectedRegId, district]);

  // Fetch villages saat selectedDistId berubah
  useEffect(() => {
    if (!selectedDistId) {
      setVillages([]);
      return;
    }
    fetch(`/api/wilayah/villages/${selectedDistId}.json`)
      .then((res) => res.json())
      .then((data: WilayahItem[]) => {
        if (!Array.isArray(data)) {
          setVillages([]);
          return;
        }
        setVillages(data);
        if (village) {
          const match = data.find((v) => matchRegionName(v.name, village));
          if (match) setSelectedVillName(match.name);
        }
      })
      .catch(() => setVillages([]));
  }, [selectedDistId, village]);

  return (
    <>
      <div className="space-y-1">
        <label className={labelClassName}>Provinsi</label>
        <select
          value={selectedProvId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedProvId(id);
            setSelectedRegId("");
            setSelectedDistId("");
            setSelectedVillName("");
            setRegencies([]);
            setDistricts([]);
            setVillages([]);
            const prov = provinces.find((p) => p.id === id);
            onChange({
              province: prov ? prov.name : "",
              city: "",
              district: "",
              village: "",
            });
          }}
          className={selectClassName}
        >
          <option value="">-- Pilih Provinsi --</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className={labelClassName}>Kota / Kabupaten</label>
        <select
          value={selectedRegId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedRegId(id);
            setSelectedDistId("");
            setSelectedVillName("");
            setDistricts([]);
            setVillages([]);
            const reg = regencies.find((r) => r.id === id);
            onChange({
              city: reg ? reg.name : "",
              district: "",
              village: "",
            });
          }}
          disabled={!selectedProvId}
          className={`${selectClassName} disabled:opacity-50`}
        >
          <option value="">
            {selectedProvId ? "-- Pilih Kota/Kabupaten --" : "-- Pilih Provinsi Dulu --"}
          </option>
          {regencies.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className={labelClassName}>Kecamatan</label>
        <select
          value={selectedDistId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedDistId(id);
            setSelectedVillName("");
            setVillages([]);
            const dist = districts.find((d) => d.id === id);
            onChange({
              district: dist ? dist.name : "",
              village: "",
            });
          }}
          disabled={!selectedRegId}
          className={`${selectClassName} disabled:opacity-50`}
        >
          <option value="">
            {selectedRegId ? "-- Pilih Kecamatan --" : "-- Pilih Kota Dulu --"}
          </option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className={labelClassName}>Desa / Kelurahan</label>
        <select
          value={selectedVillName || (village ?? "")}
          onChange={(e) => {
            const name = e.target.value;
            setSelectedVillName(name);
            onChange({ village: name });
          }}
          disabled={!selectedDistId}
          className={`${selectClassName} disabled:opacity-50`}
        >
          <option value="">
            {selectedDistId ? "-- Pilih Desa/Kelurahan --" : "-- Pilih Kecamatan Dulu --"}
          </option>
          {villages.map((v) => (
            <option key={v.id} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className={labelClassName}>Kode Pos</label>
        <input
          type="text"
          value={postalCode ?? ""}
          onChange={(e) => onChange({ postalCode: e.target.value })}
          className={inputClassName}
          placeholder="Contoh: 10650"
        />
      </div>
    </>
  );
}
