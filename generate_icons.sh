#!/bin/bash
LOGO="public/gamestrike-logo.jpg"

generate_for_dir() {
  TARGET_DIR="$1"
  echo "Generating Android icon and splash assets in $TARGET_DIR ..."
  
  # Sizes for mipmap icons
  sips -s format png -z 48 48 "$LOGO" --out "$TARGET_DIR/mipmap-mdpi/ic_launcher.png"
  sips -s format png -z 48 48 "$LOGO" --out "$TARGET_DIR/mipmap-mdpi/ic_launcher_round.png"
  sips -s format png -z 48 48 "$LOGO" --out "$TARGET_DIR/mipmap-mdpi/ic_launcher_foreground.png"

  sips -s format png -z 72 72 "$LOGO" --out "$TARGET_DIR/mipmap-hdpi/ic_launcher.png"
  sips -s format png -z 72 72 "$LOGO" --out "$TARGET_DIR/mipmap-hdpi/ic_launcher_round.png"
  sips -s format png -z 72 72 "$LOGO" --out "$TARGET_DIR/mipmap-hdpi/ic_launcher_foreground.png"

  sips -s format png -z 96 96 "$LOGO" --out "$TARGET_DIR/mipmap-xhdpi/ic_launcher.png"
  sips -s format png -z 96 96 "$LOGO" --out "$TARGET_DIR/mipmap-xhdpi/ic_launcher_round.png"
  sips -s format png -z 96 96 "$LOGO" --out "$TARGET_DIR/mipmap-xhdpi/ic_launcher_foreground.png"

  sips -s format png -z 144 144 "$LOGO" --out "$TARGET_DIR/mipmap-xxhdpi/ic_launcher.png"
  sips -s format png -z 144 144 "$LOGO" --out "$TARGET_DIR/mipmap-xxhdpi/ic_launcher_round.png"
  sips -s format png -z 144 144 "$LOGO" --out "$TARGET_DIR/mipmap-xxhdpi/ic_launcher_foreground.png"

  sips -s format png -z 192 192 "$LOGO" --out "$TARGET_DIR/mipmap-xxxhdpi/ic_launcher.png"
  sips -s format png -z 192 192 "$LOGO" --out "$TARGET_DIR/mipmap-xxxhdpi/ic_launcher_round.png"
  sips -s format png -z 192 192 "$LOGO" --out "$TARGET_DIR/mipmap-xxxhdpi/ic_launcher_foreground.png"

  # Splash screens
  sips -s format png -z 512 512 "$LOGO" --out "$TARGET_DIR/drawable/splash.png"
  for d in "$TARGET_DIR"/drawable-port-* "$TARGET_DIR"/drawable-land-*; do
    if [ -d "$d" ]; then
      sips -s format png -z 512 512 "$LOGO" --out "$d/splash.png"
    fi
  done
}

generate_for_dir "android/app/src/main/res"
generate_for_dir "admin-app/android/app/src/main/res"
echo "All app icons and splash screens updated with GameStrike logo!"
