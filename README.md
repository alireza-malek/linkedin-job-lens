# LinkedIn Job Lens

![GitHub repo size](https://img.shields.io/github/repo-size/alireza-malek/linkedin-job-lens)
[![GitHub Release](https://img.shields.io/github/v/release/alireza-malek/linkedin-job-lens)](https://github.com/alireza-malek/linkedin-job-lens/releases/latest)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/alireza-malek/linkedin-job-lens)

A smart Chrome extension that helps job seekers find, evaluate, and analyze LinkedIn job postings. Automatically detect visa sponsorship or relocation assistance, highlight custom keywords, and optionally leverage AI insights tailored to your specific profile and criteria with Bring-Your-Own (BYO) API keys.

## Features

### 🔍 Quick Keyword Scan

- **Auto-Scan**: Automatically scans LinkedIn job listings for visa sponsorship or custom keywords as you browse.
- **Custom Keywords**: Add your own keywords in **plain text** or **regex** to search for specific terms.
- **Smart In-Page Highlighting**: Highlights visa/relocation and custom keywords directly in job descriptions.
- **Badge System**: Visual badges on job cards showing match status.
- **Full List Scanning**: Automatically navigates and scans entire job search result pages.
- **Job Saving**: Saves scanned jobs with match details, search, filters, and sorting.
- **Export/Import Jobs and Settings**: Export/Import saved jobs or settings as JSON.

### ✨ AI Job Insights (BYO API Key)

- **Bring Your Own Key**: Works with any OpenAI-compatible API (OpenAI, OpenRouter, ...) as well as local models (Ollama, LM Studio). Automatically discover available models.
- **Custom Insight Templates**: Create tailored templates with your candidate context (resume, skills, preferred roles) and modular evaluation criteria.
- **Define Evaluation Criteria**: Define custom criteria (e.g., _Tech Stack Alignment_, _Seniority Fit_, _Quick Cover Letter_) with individual prompt instructions.
- **Get Insight or Ask Anything**: Get templated one-click job insights, or ask custom, ad-hoc questions about any job posting while automatically leveraging your candidate context and job details.
- **Dual Display (Side Panel & In-Page)**: View AI insights and keyword summaries inside the side panel or embedded directly above the LinkedIn job description.
- **Auto AI Insight**: Automatically trigger AI Insight upon opening a job posting.

## Installation

1. Download the [![GitHub Release](https://img.shields.io/github/v/release/alireza-malek/linkedin-job-lens)](https://github.com/alireza-malek/linkedin-job-lens/releases/latest/download/linkedin-job-lens.zip) directly or manually from the [Releases page](https://github.com/alireza-malek/linkedin-job-lens/releases) and extract the zip file.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** (toggle in the top right) and click **"Load unpacked"**.
4. Select the extracted folder. The extension is now installed!

## AI Setup & Configuration (Optional)

1. Open the side panel and click the **Settings** icon in the top header.
2. Under **AI Configuration (BYO API Key)**:
   - **API Base URL**: `https://api.openai.com/v1` (or a custom endpoint).
   - **API Key**: Enter your provider's API key (stored locally in Chrome storage).
   - **Model**: Click the refresh icon to auto-discover models or type your desired model name (e.g., `gpt-6-luna`).
   - Click **Test Connection** to verify your setup, then click **Save AI Settings**.
3. Click the **Templates** icon in the top header to create your **AI Insight Templates**:
   - Add your candidate background / resume in the **Context** field.
   - Add one or more **Evaluation Criteria** with specific prompts.
   - Set the template as **Active** to use it for single-click job evaluations.

## Permissions

This extension uses the following permissions:

- `activeTab`: To interact with the active LinkedIn tab.
- `scripting`: To inject content scripts for scanning and highlighting.
- `sidePanel`: To display the extension side panel interface.
- `storage`: To store your scanned jobs, keywords, templates, and settings locally.
- `tabs`: To detect job navigation and track tab updates.
- `downloads`: To export saved jobs and settings.

### Privacy & Security

- **100% Client-Side**: All scans, keywords, and job data are processed entirely within your browser.
- **Zero Intermediary Servers**: AI requests are sent directly from your browser to your configured AI provider or local LLM endpoint.
- **Safe Settings Export**: Exporting settings excludes your API key to prevent accidental credential leakage.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This extension is not affiliated with, endorsed by, or connected to LinkedIn Corporation. It is an independent tool created to help job seekers find relevant opportunities.
