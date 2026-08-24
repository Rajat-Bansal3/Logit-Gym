import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import multer, { type FileFilterCallback } from "multer";

const storage = multer.diskStorage({
	destination: (_req, _file, cb) => {
		const uploadPath = "./uploads";

		if (!fs.existsSync(uploadPath)) {
			fs.mkdirSync(uploadPath, { recursive: true });
		}

		cb(null, uploadPath);
	},
	filename: (req, file, cb) => {
		const imageUuid = crypto.randomUUID();

		const ext = path.extname(file.originalname).toLowerCase();

		const finalFilename = `${imageUuid}${ext}`;

		(req as any).newImageUuid = imageUuid;

		cb(null, finalFilename);
	},
});
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = /jpeg|jpg|png|webp/;
const imageFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
	const isMimeTypeValid = ALLOWED_MIME_TYPES.includes(file.mimetype);
	const isExtensionValid = ALLOWED_EXTENSIONS.test(path.extname(file.originalname).toLowerCase());

	if (isMimeTypeValid && isExtensionValid) {
		cb(null, true);
	} else {
		cb(new Error("Invalid file type. Only JPEG, PNG, and WEBP images are allowed."));
	}
};
const uploadConfig = multer({
	storage: storage,
	fileFilter: imageFilter,
	limits: {
		fileSize: 5 * 1024 * 1024,
	},
});
export const uploadSingleImage = (fieldName: string = "image") => {
	return (req: Request, res: Response, next: NextFunction) => {
		const upload = uploadConfig.single(fieldName);

		upload(req, res, (err: any) => {
			if (err instanceof multer.MulterError) {
				if (err.code === "LIMIT_FILE_SIZE") {
					return res.status(400).json({
						success: false,
						error: "File size exceeds the maximum limit of 5MB.",
					});
				}
				return res.status(400).json({ success: false, error: err.message });
			} else if (err) {
				return res.status(400).json({
					success: false,
					error: err.message,
				});
			}

			return next();
		});
	};
};

export const uploadMultipleImage = (fieldName: string = "images", maxCount: number = 5) => {
	return (req: Request, res: Response, next: NextFunction) => {
		const upload = uploadConfig.array(fieldName, maxCount);

		upload(req, res, (err: any) => {
			if (err instanceof multer.MulterError) {
				if (err.code === "LIMIT_FILE_SIZE") {
					return res.status(400).json({
						success: false,
						error: "One or more files exceed the maximum limit of 5MB.",
					});
				}

				if (err.code === "LIMIT_UNEXPECTED_FILE") {
					return res.status(400).json({
						success: false,
						error: `Exceeded maximum limit of ${maxCount} files for field '${fieldName}'.`,
					});
				}

				return res.status(400).json({
					success: false,
					error: err.message,
				});
			}

			if (err) {
				return res.status(400).json({
					success: false,
					error: err.message,
				});
			}

			return next();
		});
	};
};
