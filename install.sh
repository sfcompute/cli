#!/usr/bin/env sh

set -e # Exit on any error

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
    sudo apt-get update && sudo apt-get install -y unzip || { echo "Failed to install unzip via apt-get"; exit 1; }
  elif command_exists yum; then
    sudo yum install -y unzip || { echo "Failed to install unzip via yum"; exit 1; }
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
mkdir -p "${TARGET_DIR}" || { echo "Failed to create target directory"; exit 1; }

# Define the target file path for the 'sf' CLI binary.
TARGET_FILE="${TARGET_DIR}/${BINARY_NAME}"

if [ "$OS" = "Linux" ]; then
  case "${ARCH}" in
    x86_64)
      target='x86_64-unknown-linux-gnu'
      ;;
    aarch64)
      target='aarch64-unknown-linux-gnu'
      ;;
    *)
      echo "Unsupported Linux architecture: ${ARCH}" >&2
      exit 1
      ;;
  esac
elif [ "$OS" = "Darwin" ]; then
  case "${ARCH}" in
    x86_64)
      target='x86_64-apple-darwin'
      ;;
    arm64)
      target='aarch64-apple-darwin'
      ;;
    *)
      echo "Unsupported macOS architecture: ${ARCH}" >&2
      exit 1
      ;;
  esac
else
  echo "Unsupported operating system: ${OS}" >&2
  exit 1
fi

# Set up temporary directory for download and extraction
TMPDIR=$(mktemp -d) || { echo "Failed to create temporary directory"; exit 1; }

GITHUB=${GITHUB-"https://github.com"}

github_repo="$GITHUB/$GITHUB_REPO"

# Check if a version is provided as an argument or environment variable
if [ -n "${SF_CLI_VERSION}" ]; then
    VERSION="${SF_CLI_VERSION}"
    SF_BINARY_URL=$github_repo/releases/download/$VERSION/sf-$target.zip
elif [ $# -eq 0 ]; then
    SF_BINARY_URL=$github_repo/releases/latest/download/sf-$target.zip
else
    VERSION=$1
    echo "Downloading version $VERSION"
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
curl -L -o "${TMPDIR}/${BINARY_NAME}.zip" "${SF_BINARY_URL}" || { echo "Failed to download binary"; exit 1; }

# Verify the downloaded file is a valid zip archive
if ! unzip -t "${TMPDIR}/${BINARY_NAME}.zip" >/dev/null 2>&1; then
    echo "Downloaded file is not a valid zip archive. Installation failed."
    rm -rf "${TMPDIR}"
    exit 1
fi

# Extract the zip file in the temporary directory.
echo "unzip -o \"${TMPDIR}/${BINARY_NAME}.zip\" -d \"${TMPDIR}/dist\""
unzip -o "${TMPDIR}/${BINARY_NAME}.zip" -d "${TMPDIR}/dist" || { echo "Failed to extract sf"; exit 1; }

# Move the binary to the target directory.
mv "${TMPDIR}/dist/sf-$target" "${TARGET_FILE}" || { echo "Failed to move binary to target location"; exit 1; }

# Make the downloaded binary executable.
chmod +x "${TARGET_FILE}" || { echo "Failed to make binary executable"; exit 1; }

# Clean up the temporary directory.
rm -rf "${TMPDIR}" || { echo "Failed to clean up temporary directory"; exit 1; }

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
    exit 1
fi
