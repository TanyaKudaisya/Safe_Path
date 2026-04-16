import axios from "axios";
import Report from "../models/Report.model.js";
import fs from "fs";
import FormData from "form-data";

export const ReportController = {

  register: async (req, res) => {

    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const { name, description, latitude, longitude, user_id } = req.body;

    try {

      const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

      const report = new Report({

        name,
        description,

        photo: photoPath,

        location: {
          latitude: Number(latitude),
          longitude: Number(longitude),
        },

        user_id,

        detections: []

      });

      await report.save();

      if (photoPath && req.file) {

        const path = req.file.path.replace(/\\/g, "/");

        if (!fs.existsSync(path)) {
          return res.status(400).json({ error: "File not found" });
        }

        const formData = new FormData();
        formData.append("file", fs.createReadStream(path));

        const detectionResponse = await axios.post(
          "http://192.168.1.29:9001/detect-image",
          formData,
          {
            headers: formData.getHeaders(),
          }
        );

        console.log("YOLO RESPONSE:", detectionResponse.data);

        if (detectionResponse.data.detected === true) {

          report.detections = [
            {
              damage_type: "pothole",
              confidence_score: 0.9,
            },
          ];

          await report.save();
        }
      }

      res.status(201).json({
        report,
        message: "Report registered successfully!",
      });

    } catch (error) {

      console.error("REGISTER ERROR:", error);
      res.status(400).json({ error: error.message });

    }
  },

  getAllReports: async (req, res) => {

    try {

      const reports = await Report.find();
      res.status(200).json(reports);

    } catch (error) {

      res.status(500).json({ error: error.message });

    }
  },

  getReportById: async (req, res) => {

    const { id } = req.params;

    try {

      const report = await Report.findById(id);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.status(200).json(report);

    } catch (error) {

      res.status(500).json({ error: error.message });

    }
  },

  getReportByUserId: async (req, res) => {

    const { user_id } = req.params;

    try {

      const reports = await Report.find({ user_id });
      res.status(200).json(reports);

    } catch (error) {

      res.status(500).json({ error: error.message });

    }
  },

  deleteReport: async (req, res) => {

    const { id } = req.params;

    try {

      const report = await Report.findByIdAndDelete(id);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.status(200).json({ message: "Report deleted successfully" });

    } catch (error) {

      res.status(500).json({ error: error.message });

    }
  },
  resolveReport: async (req, res) => {
    const { id } = req.params;

    try {
      const report = await Report.findByIdAndUpdate(
        id,
        { status: "resolved" },
        { new: true }
      );

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.status(200).json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

};