import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Button, StyleSheet } from "react-native";
import { ReportService } from "@/services/ReportService";

export default function AdminScreen() {
    const [reports, setReports] = useState<any[]>([]);

    const fetchReports = async () => {
        const data = await ReportService.getAllReports();
        setReports(data);
    };

    useEffect(() => {
        fetchReports();
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Admin Panel</Text>

            <FlatList
                data={reports}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <Text>Name: {item.name}</Text>
                        <Text>Status: {item.status}</Text>

                        <Button
                            title="Resolve"
                            onPress={async () => {
                                await ReportService.resolveReport(item._id);
                                fetchReports();
                            }}
                        />

                        <Button
                            title="Delete"
                            onPress={async () => {
                                await ReportService.deleteReport(item._id);
                                fetchReports();
                            }}
                        />
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    header: { fontSize: 22, fontWeight: "bold" },
    card: { padding: 10, borderWidth: 1, marginVertical: 10 },
});