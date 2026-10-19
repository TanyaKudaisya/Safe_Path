import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export interface DetectionLike {
  damageType: string;
  confidenceScore: number;
}

interface ReportLike {
  detections?: DetectionLike[] | null;
  detectionCount?: number | null;
  maxConfidence?: number | null;
  avgConfidence?: number | null;
}

// Uses the summary stored by the backend; falls back to computing it from
// `detections` for reports saved before the summary fields existed.
export const summarizeDetections = (report: ReportLike) => {
  const list = report.detections ?? [];
  const scores = list.map((d) => d.confidenceScore);
  const count = report.detectionCount ?? list.length;
  const max =
    report.maxConfidence ?? (scores.length ? Math.max(...scores) : null);
  const avg =
    report.avgConfidence ??
    (scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null);
  return { count, max, avg, list };
};

const pct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);

export default function DetectionSummary({ report }: { report: ReportLike }) {
  const [open, setOpen] = useState(false);
  const { count, max, avg, list } = summarizeDetections(report);

  if (count === 0) return null;

  return (
    <View style={styles.box}>
      <Text style={styles.summary}>
        {count} pothole{count === 1 ? "" : "s"} detected · highest {pct(max)} ·
        average {pct(avg)}
      </Text>
      {list.length > 0 && (
        <TouchableOpacity onPress={() => setOpen((o) => !o)}>
          <Text style={styles.toggle}>
            {open ? "Hide details" : "Show each detection"}
          </Text>
        </TouchableOpacity>
      )}
      {open &&
        list.map((d, i) => (
          <Text key={i} style={styles.row}>
            • {d.damageType} #{i + 1}: {pct(d.confidenceScore)}
          </Text>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 6 },
  summary: { fontSize: 14, fontWeight: "600", color: "#222" },
  toggle: { fontSize: 13, color: "#2D8CFF", marginTop: 4 },
  row: { fontSize: 13, color: "#444", marginTop: 2 },
});
