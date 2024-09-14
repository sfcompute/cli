#!/bin/bash

# Define the GitHub repository and the name of the binary.
GITHUB_REPO="sfcompute/cli"
BINARY_NAME="sf"

# Check the operating system
OS="$(uname -ms)"

# If the operating system is Linux, set the target directory to '/usr/local/bin'
# If the operating system is Darwin (macOS), set the target directory to '${HOME}/.local/bin'
if [[ "$OS" == "Linux"* ]]; then
  TARGET_DIR="/usr/local/bin"
elif [[ "$OS" == "Darwin"* ]]; then
  TARGET_DIR="${HOME}/.local/bin"
else
  echo "Unsupported operating system: $OS"
  exit 1
fi

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check if unzip is installed, if not, try to install it
if ! command_exists unzip; then
  echo "unzip is not installed. Attempting to install..."
  if command_exists apt-get; then
    sudo apt-get update && sudo apt-get install -y unzip
  elif command_exists yum; then
    sudo yum install -y unzip
  else
    echo "Unable to install unzip. Please install it manually and run this script again."
    exit 1
  fi
fi

# Verify unzip is now available
if ! command_exists unzip; then
  echo "Failed to install unzip. Please install it manually and run this script again."
  exit 1
fi

# Make sure the target dir exists
mkdir -p "${TARGET_DIR}"

# Define the target file path for the 'sf' CLI binary.
TARGET_FILE="${TARGET_DIR}/${BINARY_NAME}"

if [[ "$OS" == "Linux"* ]]; then
  if [[ "$OS" == 'Linux aarch64' ]]; then
    target='bun-linux-arm64'
  else 
    target='bun-linux-x64'
  fi  
elif [[ "$OS" == "Darwin"* ]]; then
  sys="$(sysctl -n machdep.cpu.brand_string)"
  if [[ $sys == *"M1"* || $sys == *"M2"* || $sys == *"M3"* ]]; then
    target='bun-darwin-arm64'
  else
    target='bun-darwin-x64'
  fi  
fi

# Set up temporary directory for download and extraction
TMPDIR=$(mktemp -d)

GITHUB=${GITHUB-"https://github.com"}

github_repo="$GITHUB/$GITHUB_REPO"

# Check if a version is provided as an argument
if [[ $# -eq 0 ]]; then
    SF_BINARY_URL=$github_repo/releases/latest/download/sf-$target.zip
else
    VERSION=$1
    SF_BINARY_URL=$github_repo/releases/download/$VERSION/sf-$target.zip
fi

# Check if the download URL was found.
if [ -z "${SF_BINARY_URL}" ]; then
    echo "Failed to find the download URL for the '${BINARY_NAME}' binary."
    echo "Please check the GitHub repository and release information."
    exit 1
fi

# Download the 'sf' CLI binary from the specified URL.
echo "Downloading '${BINARY_NAME}' CLI binary..."
echo "curl -L -o \"${TMPDIR}/${BINARY_NAME}.zip\" \"${SF_BINARY_URL}\""
curl -L -o "${TMPDIR}/${BINARY_NAME}.zip" "${SF_BINARY_URL}"

# Extract the zip file in the temporary directory.
echo "unzip -o \"${TMPDIR}/${BINARY_NAME}.zip\" -d \"${TMPDIR}/dist\""
unzip -o "${TMPDIR}/${BINARY_NAME}.zip" -d "${TMPDIR}/dist" ||
    { echo "Failed to extract sf"; exit 1; }

# Move the binary to the target directory.
mv "${TMPDIR}/dist/sf-$target" "${TARGET_DIR}/${BINARY_NAME}"

# Make the downloaded binary executable.
chmod +x "${TARGET_FILE}"

# Clean up the temporary directory.
rm -rf "${TMPDIR}"

# Verify that the 'sf' CLI binary is successfully installed.
if [ -f "${TARGET_FILE}" ]; then
    echo "Successfully installed '${BINARY_NAME}' CLI."
    echo "The binary is located at '${TARGET_FILE}'."

    # Provide instructions for adding the target directory to the PATH.
    echo -e "\033[0;32m"
    echo -e "To use the '${BINARY_NAME}' command, add '${TARGET_DIR}' to your PATH."
    echo -e "You can do this by running one of the following commands, depending on your shell:"
    echo -e "\033[0m"
    echo -e "\033[0;32mFor bash:"
    echo -e "\033[1m  echo 'export PATH=\"${TARGET_DIR}:\$PATH\"' >> ~/.bashrc && source ~/.bashrc\033[0m"
    echo -e "\033[0;32m"
    echo -e "\033[0;32mFor zsh:"
    echo -e "\033[1m  echo 'export PATH=\"${TARGET_DIR}:\$PATH\"' >> ~/.zshrc && source ~/.zshrc\033[0m"
    echo -e "\033[0;32m"
    echo -e "After running the appropriate command, you can use '${BINARY_NAME}'.\033[0m"
    echo -e "\033[0;32m"
    echo -e "To get started, run: 'sf login'\033[0m"
    echo -e "\033[0;32m"

else
    echo "Installation failed. '${BINARY_NAME}' CLI could not be installed."
fi
