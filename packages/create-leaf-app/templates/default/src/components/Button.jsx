import { LeafComponent, registerComponent } from '@leaf-web/core';
import { palette } from '../colors';

class Button extends LeafComponent {
  constructor(props) {
    super();

    this.props = props;
  }

  render() {
    return <button onClick={this.props.onClick}>{this.props.children}</button>;
  }

  css() {
    return `
      button {
        padding: 5px 10px;
        background-color: transparent;
        border: 1px solid ${palette.primary};
        border-radius: 5px;
        transition: all 0.1s;
      }

      button:hover {
        background-color: ${palette.primary};
        color: white;
        cursor: pointer;
      }

      button:focus {
        box-shadow: 0px 0px 0px 2px ${palette.secondary};
        border-color: ${palette.secondary};
      }
    `;
  }
}

registerComponent('leaf-button', Button);

export default Button;
