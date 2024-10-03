#!/usr/bin/env sh

# Define the GitHub repository and the name of the binary.
GITHUB_REPO="sfcompute/cli"
BINARY_NAME="sf"

# Check the operating system
OS="$(uname -s)"
ARCH="$(uname -m)"

TARGET_DIR_UNEXPANDED="\${HOME}/.local/bin"
TARGET_DIR="${HOME}/.local/bin"

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

if [ "$OS" = "Linux" ]; then
  case "${ARCH}" in
    x86_64)
      target='bun-linux-x64'
      ;;
    aarch64)
      target='bun-linux-arm64'
      ;;
    *)
      echo "Unsupported Linux architecture: ${ARCH}" >&2
      exit 1
      ;;
  esac
elif [ "$OS" = "Darwin" ]; then
  sys="$(sysctl -n machdep.cpu.brand_string)"
  case "$sys" in
  *M1*|*M2*|*M3*)
    echo "Installing for Apple Silicon"
    target='bun-darwin-arm64'
    ;;
  *)
    echo "Installing for Intel Mac"
    target='bun-darwin-x64'
    ;;
  esac
fi

# Set up temporary directory for download and extraction
TMPDIR=$(mktemp -d)

GITHUB=${GITHUB-"https://github.com"}

github_repo="$GITHUB/$GITHUB_REPO"

# Check if a version is provided as an argument
if [ $# -eq 0 ]; then
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
mv -T "${TMPDIR}/dist/sf-$target" "${TARGET_FILE}"

# Make the downloaded binary executable.
chmod +x "${TARGET_FILE}"

# Clean up the temporary directory.
rm -rf "${TMPDIR}"

# Verify that the 'sf' CLI binary is successfully installed.
if [ -f "${TARGET_FILE}" ]; then
    echo "Successfully installed '${BINARY_NAME}' CLI."
    echo "The binary is located at '${TARGET_FILE}'."

    # Provide instructions for adding the target directory to the PATH.
    printf "\033[0;32m\\n"
    printf "To use the '%s' command, add '%s' to your PATH.\\n" "${BINARY_NAME}" "${TARGET_DIR_UNEXPANDED}"
    printf "You can do this by running one of the following commands, depending on your shell\\n"
    printf "\033[0m\\n"
    printf "\033[0;32mFor sh:\\n"
    printf "\033[1m  echo 'export PATH=\"%s:\$PATH\"' >> ~/.profile && source ~/.profile\033[0m\\n" "${TARGET_DIR_UNEXPANDED}"
    printf "\033[0;32m\\n"
    # For bash the "proper" answer is to only modify the .profile and then as
    # the login shell, or the desktop environment (such as the X session, or
    # Wayland session) is supposed to load the .profile, but as many desktop
    # environments such as xfce4 don't do this properly (and it sounds as though
    # almost no Wayland environments handle it properly) unless the user edits
    # their .xsessionrc the practical solution (that other installers such as
    # rustup also use) is to set both .profile, and .bashrc.
    #
    # One could probably only edit .bashrc if they wanted as most distributions
    # have ~/.profile (or ~/.bash_profile) also load .bashrc if the shell is
    # bash.
    printf "\033[0;32mFor bash:\\n"
    printf "\033[1m  echo 'export PATH=\"%s:\$PATH\"' >> ~/.profile && echo 'export PATH=\"%s:\$PATH\"' >> ~/.bashrc && source ~/.profile\033[0m\\n" "${TARGET_DIR_UNEXPANDED}" "${TARGET_DIR_UNEXPANDED}"
    printf "\033[0;32m\\n"
    printf "\033[0;32mFor zsh:\\n"
    printf "\033[1m  echo 'export PATH=\"%s:\$PATH\"' >> ~/.zshrc && source ~/.zshrc\033[0m\\n" "${TARGET_DIR_UNEXPANDED}"
    printf "\033[0;32m\\n"
    printf "After running the appropriate command, you can use '%s'.\033[0m\\n" "${BINARY_NAME}"
    printf "\033[0;32m\\n"
    printf "To get started, run: 'sf login'\033[0m\\n"
    printf "\033[0;32m\\n"

else
    echo "Installation failed. '${BINARY_NAME}' CLI could not be installed."
fi
