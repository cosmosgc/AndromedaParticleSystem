# SS14 Particle Effect Builder

A web-based tool for building and previewing particle effects for [Space Station 14](https://spacestation14.io/) (SS14). This application allows developers to create particle effects defined in YAML format, preview them in real-time on a canvas, and export the YAML configuration for use in the game.

## Features

- **Real-time Preview**: Visualize particle effects on an interactive canvas with grid overlay and particle count statistics.
- **Interactive Editor**: Modify effect properties through intuitive tabs:
  - **Basic**: Set sprite, lifetime, size, and emission parameters.
  - **Motion**: Configure movement, rotation, and direction settings.
  - **Curves**: Define curves for size, color, alpha, and other properties over lifetime.
  - **YAML**: View and edit the raw YAML configuration directly.
- **Preset Effects**: Load predefined particle effects as starting points.
- **Export Functionality**: Generate ready-to-paste YAML code for SS14 particle prototypes.
- **Controls**: Pause, restart, and burst fire effects for testing.

## Installation

1. Clone or download this repository.
2. Place the files in your web server's document root (e.g., `htdocs` for XAMPP).
3. Open `index.html` in a modern web browser.

### Requirements

- A modern web browser with HTML5 Canvas support (Chrome, Firefox, Safari, Edge).
- No server-side dependencies; runs entirely client-side.

## Usage

1. Open the application in your browser.
2. Select a preset effect from the dropdown or start with a blank effect.
3. Use the editor tabs to adjust properties:
   - Modify basic parameters like sprite path, lifetime, and emission rate.
   - Configure motion settings for velocity, acceleration, and rotation.
   - Define curves for dynamic properties over the particle's lifetime.
   - Edit the YAML directly for advanced configurations.
4. Preview the effect on the canvas in real-time.
5. Use the control buttons to pause, restart, or burst the effect.
6. Copy the generated YAML from the YAML tab to use in your SS14 project.

## Project Structure

- `index.html`: Main HTML structure and UI.
- `styles.css`: Styling for the application interface.
- `app.js`: JavaScript logic for the particle system simulation and editor functionality.
- `Particles.md`: Documentation for the SS14 particle system framework.

## Technologies Used

- **HTML5**: Structure and canvas for rendering.
- **CSS3**: Styling and responsive design.
- **JavaScript (ES6+)**: Particle simulation, UI interactions, and YAML generation.
- **Canvas API**: Real-time particle rendering.

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test thoroughly in multiple browsers.
5. Submit a pull request.

## License

This project is open-source. Please check the license file for details.

## Related Resources

- [Space Station 14 Wiki](https://wiki.spacestation14.io/)
- [SS14 Particle System Documentation](Particles.md)
- [SS14 GitHub Repository](https://github.com/space-wizards/space-station-14)